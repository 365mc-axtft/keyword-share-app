import { Router } from "express";
import { z } from "zod";
import imageSize from "image-size";
import { db, newId } from "../db";
import { requireAuth, isTeamAccessible, AuthUser } from "../middleware/auth";
import { asyncHandler, ApiError } from "../lib/asyncHandler";
import { toCamel } from "../lib/caseConvert";
import { upload } from "../lib/upload";
import { storage } from "../lib/storage";
import { env } from "../env";
import { matchChannel } from "../lib/matching";
import { guessChannelType } from "../lib/channelTypeGuess";
import { suggestClassification } from "../lib/classificationSuggestion";
import { computeTop10 } from "../lib/topN";
import { recordAudit } from "../lib/audit";

export const tabAnalysesRouter = Router();
tabAnalysesRouter.use(requireAuth);

async function loadTabAnalysisOrThrow(tabAnalysisId: string, user: AuthUser) {
  const tab = await db("tab_analyses").where({ id: tabAnalysisId }).first();
  if (!tab) throw new ApiError(404, "TAB_ANALYSIS_NOT_FOUND", "분석을 찾을 수 없습니다.");
  const investigation = await db("investigations").where({ id: tab.investigation_id }).first();
  // 보안: globalRole만으로 우회하지 않고, 팀이 사용자 소속 회사의 팀인지까지 반드시 확인한다
  // (다른 회사 관리자가 team_id를 알아내 남의 회사 분석 데이터를 보는 것을 막기 위함).
  if (!(await isTeamAccessible(user, investigation.team_id))) {
    throw new ApiError(403, "FORBIDDEN_TEAM", "권한이 없습니다.");
  }
  return { tab, investigation };
}

function assertNotSaved(tab: { status: string }) {
  if (tab.status === "SAVED") {
    throw new ApiError(400, "TAB_ALREADY_SAVED", "이미 저장된 분석은 수정할 수 없습니다. 팀 대시보드에서 재편집하세요.");
  }
}

tabAnalysesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    const images = await db("uploaded_images").where({ tab_analysis_id: tab.id }).orderBy("sequence_index");
    const modules = await db("detected_modules").where({ tab_analysis_id: tab.id });
    const posts = await db("posts")
      .where({ tab_analysis_id: tab.id })
      .orderBy("original_order");
    res.json({ tabAnalysis: toCamel(tab), images: toCamel(images), modules: toCamel(modules), posts: toCamel(posts) });
  })
);

// ---- 이미지 업로드 ----

tabAnalysesRouter.post(
  "/:id/images",
  upload.array("images", 20),
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    assertNotSaved(tab);
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) throw new ApiError(400, "NO_FILES", "업로드할 이미지가 없습니다.");

    const existingCount = await db("uploaded_images")
      .where({ tab_analysis_id: tab.id })
      .count<{ count: string }[]>("id as count")
      .first();
    let sequenceIndex = Number(existingCount?.count ?? 0);

    const created = [];
    for (const file of files) {
      let dims: { width?: number; height?: number };
      try {
        dims = imageSize(file.buffer);
      } catch {
        throw new ApiError(400, "IMAGE_UNREADABLE", `${file.originalname}: 이미지 형식을 읽을 수 없습니다.`);
      }
      const width = dims.width ?? 0;
      const height = dims.height ?? 0;
      const megapixels = (width * height) / 1_000_000;
      if (megapixels > env.maxUploadMegapixels) {
        throw new ApiError(
          400,
          "IMAGE_TOO_LARGE",
          `${file.originalname}: 해상도(${megapixels.toFixed(1)}MP)가 한도(${env.maxUploadMegapixels}MP)를 초과합니다.`
        );
      }
      const { storagePath } = await storage.save(file.buffer, file.originalname);
      const id = newId();
      await db("uploaded_images").insert({
        id,
        tab_analysis_id: tab.id,
        original_name: file.originalname,
        storage_path: storagePath,
        mime_type: file.mimetype,
        file_size_bytes: file.size,
        width_px: width,
        height_px: height,
        sequence_index: sequenceIndex++,
        ocr_status: "PENDING",
        created_at: new Date(),
      });
      created.push(await db("uploaded_images").where({ id }).first());
    }

    await db("tab_analyses").where({ id: tab.id }).update({ status: "UPLOADING", updated_at: new Date() });
    res.status(201).json({ images: toCamel(created) });
  })
);

tabAnalysesRouter.get(
  "/:id/images/:imageId/file",
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    const image = await db("uploaded_images").where({ id: req.params.imageId, tab_analysis_id: tab.id }).first();
    if (!image) throw new ApiError(404, "IMAGE_NOT_FOUND", "이미지를 찾을 수 없습니다.");
    res.sendFile(storage.absolutePath(image.storage_path));
  })
);

tabAnalysesRouter.delete(
  "/:id/images/:imageId",
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    assertNotSaved(tab);
    const image = await db("uploaded_images").where({ id: req.params.imageId, tab_analysis_id: tab.id }).first();
    if (!image) throw new ApiError(404, "IMAGE_NOT_FOUND", "이미지를 찾을 수 없습니다.");
    await db.transaction(async (trx) => {
      await trx("posts").where({ uploaded_image_id: image.id }).delete();
      await trx("detected_modules").where({ uploaded_image_id: image.id }).delete();
      await trx("uploaded_images").where({ id: image.id }).delete();
    });
    await storage.delete(image.storage_path);
    res.json({ ok: true });
  })
);

tabAnalysesRouter.post(
  "/:id/images/:imageId/ocr-status",
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    const { status, error } = z
      .object({ status: z.enum(["PROCESSING", "DONE", "FAILED"]), error: z.string().optional() })
      .parse(req.body);
    const patch: Record<string, unknown> = { ocr_status: status };
    if (status === "PROCESSING") patch.ocr_started_at = new Date();
    if (status === "DONE" || status === "FAILED") patch.ocr_finished_at = new Date();
    if (status === "FAILED") patch.ocr_error = error ?? "알 수 없는 오류";
    await db("uploaded_images").where({ id: req.params.imageId, tab_analysis_id: tab.id }).update(patch);
    res.json({ ok: true });
  })
);

// ---- OCR 결과 제출 (브라우저 OCR 완료 후, 1차 레이아웃 + 2차 채널/제목 인식 결과) ----

const moduleInputSchema = z.object({
  localId: z.string(),
  uploadedImageId: z.string().optional().nullable(),
  kind: z.enum(["MODULE", "GENERAL_SOURCE"]),
  name: z.string().min(1),
  isPostBearing: z.boolean().default(true),
  includedByDefault: z.boolean().default(true),
  detectedPostCount: z.number().int().min(0).default(0),
});

const postInputSchema = z.object({
  groupLocalId: z.string().nullable().optional(),
  uploadedImageId: z.string().nullable().optional(),
  originalOrder: z.number().int(),
  exposedChannelName: z.string().default(""),
  titleText: z.string().default(""),
  channelIdOrUrlGuess: z.string().nullable().optional(),
  ocrRawChannelName: z.string().nullable().optional(),
  ocrRawTitle: z.string().nullable().optional(),
  ocrConfidenceChannel: z.number().nullable().optional(),
  ocrConfidenceTitle: z.number().nullable().optional(),
  sourceBounds: z.any().optional(),
});

const ocrResultsSchema = z.object({
  modules: z.array(moduleInputSchema).default([]),
  posts: z.array(postInputSchema).default([]),
});

tabAnalysesRouter.post(
  "/:id/ocr-results",
  asyncHandler(async (req, res) => {
    const { tab, investigation } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    assertNotSaved(tab);
    const body = ocrResultsSchema.parse(req.body);
    const team = await db("teams").where({ id: investigation.team_id }).first();
    const companyId: string = team.company_id;

    await db.transaction(async (trx) => {
      // 기존 자동 분석 결과(수동 추가 제외)를 전부 교체한다 — 재업로드/재시도 시 중복 방지.
      await trx("posts").where({ tab_analysis_id: tab.id, is_manually_added: false }).delete();
      await trx("detected_modules").where({ tab_analysis_id: tab.id }).delete();

      const localToGroupId = new Map<string, string>();
      for (const m of body.modules) {
        const id = newId();
        localToGroupId.set(m.localId, id);
        await trx("detected_modules").insert({
          id,
          tab_analysis_id: tab.id,
          uploaded_image_id: m.uploadedImageId ?? null,
          kind: m.kind,
          name: m.name,
          is_post_bearing: m.isPostBearing,
          included_by_default: m.includedByDefault,
          detected_post_count: m.detectedPostCount,
          created_at: new Date(),
        });
      }

      for (const p of body.posts) {
        const channelTypeGuess = guessChannelType({
          exposedChannelName: p.exposedChannelName,
          channelIdOrUrl: p.channelIdOrUrlGuess ?? null,
        });
        const match = await matchChannel({
          companyId,
          platform: guessPlatform(channelTypeGuess),
          exposedChannelName: p.exposedChannelName,
          channelIdOrUrl: p.channelIdOrUrlGuess ?? null,
        });

        let suggestion: ReturnType<typeof suggestClassification> = {
          contentType: null,
          related365mc: null,
          branchId: null,
          branchStatus: "NOT_APPLICABLE",
        };
        if (match.matchedChannelId) {
          const channel = await trx("channels").where({ id: match.matchedChannelId }).first();
          suggestion = suggestClassification({ channelSegment: channel.segment, channelBranchId: channel.branch_id });
        }

        await trx("posts").insert({
          id: newId(),
          tab_analysis_id: tab.id,
          uploaded_image_id: p.uploadedImageId ?? null,
          group_id: p.groupLocalId ? localToGroupId.get(p.groupLocalId) ?? null : null,
          original_order: p.originalOrder,
          analysis_rank: null,
          included_in_top10: false,
          is_deleted_misrecognition: false,
          is_manually_added: false,
          channel_type_guess: channelTypeGuess,
          exposed_channel_name: p.exposedChannelName,
          title_text: p.titleText,
          ocr_raw_channel_name: p.ocrRawChannelName ?? null,
          ocr_raw_title: p.ocrRawTitle ?? null,
          ocr_confidence_channel: p.ocrConfidenceChannel ?? null,
          ocr_confidence_title: p.ocrConfidenceTitle ?? null,
          matched_channel_id: match.matchedChannelId,
          match_method: match.matchMethod,
          match_confidence: match.matchConfidence,
          content_type: suggestion.contentType,
          related_365mc: suggestion.related365mc,
          branch_id: suggestion.branchId,
          branch_status: suggestion.branchStatus,
          branch_source: "AUTO",
          content_type_source: "AUTO",
          source_bounds_json: p.sourceBounds ? JSON.stringify(p.sourceBounds) : null,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      await trx("tab_analyses").where({ id: tab.id }).update({ status: "NEEDS_REVIEW", updated_at: new Date() });
    });

    const modules = await db("detected_modules").where({ tab_analysis_id: tab.id });
    const posts = await db("posts").where({ tab_analysis_id: tab.id }).orderBy("original_order");
    res.json({ modules: toCamel(modules), posts: toCamel(posts) });
  })
);

function guessPlatform(channelTypeGuess: string): string {
  switch (channelTypeGuess) {
    case "CAFE":
      return "NAVER_CAFE";
    case "KIN":
      return "KIN";
    case "TISTORY":
      return "TISTORY";
    case "OWN_HOMEPAGE":
      return "OWN_HOMEPAGE";
    case "APP":
      return "APP";
    case "OWN_BLOG":
    case "BLOG":
      return "NAVER_BLOG";
    default:
      return "OTHER";
  }
}

// ---- 모듈 검수 (포함/제외, 이름 수정) ----

const moduleUpdateSchema = z.object({
  includedByDefault: z.boolean().optional(),
  name: z.string().min(1).optional(),
  isPostBearing: z.boolean().optional(),
});

tabAnalysesRouter.patch(
  "/:id/modules/:moduleId",
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    assertNotSaved(tab);
    const body = moduleUpdateSchema.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.includedByDefault !== undefined) patch.included_by_default = body.includedByDefault;
    if (body.name !== undefined) patch.name = body.name;
    if (body.isPostBearing !== undefined) patch.is_post_bearing = body.isPostBearing;
    await db("detected_modules").where({ id: req.params.moduleId, tab_analysis_id: tab.id }).update(patch);
    res.json({ ok: true });
  })
);

// ---- 게시물 검수 (채널 종류/채널명/제목/오인식 삭제/수동 추가) ----

const postUpdateSchema = z.object({
  channelTypeGuess: z
    .enum(["OWN_HOMEPAGE", "OWN_BLOG", "CAFE", "KIN", "TISTORY", "APP", "BLOG", "OTHER", "UNCLASSIFIED"])
    .optional(),
  exposedChannelName: z.string().optional(),
  titleText: z.string().optional(),
  isDeletedMisrecognition: z.boolean().optional(),
  matchedChannelId: z.string().nullable().optional(),
});

tabAnalysesRouter.patch(
  "/:id/posts/:postId",
  asyncHandler(async (req, res) => {
    const { tab, investigation } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    assertNotSaved(tab);
    const existing = await db("posts").where({ id: req.params.postId, tab_analysis_id: tab.id }).first();
    if (!existing) throw new ApiError(404, "POST_NOT_FOUND", "게시물을 찾을 수 없습니다.");
    const body = postUpdateSchema.parse(req.body);

    const patch: Record<string, unknown> = { updated_at: new Date(), last_edited_by_id: req.user!.id };
    if (body.channelTypeGuess !== undefined) patch.channel_type_guess = body.channelTypeGuess;
    if (body.titleText !== undefined) patch.title_text = body.titleText;
    if (body.isDeletedMisrecognition !== undefined) patch.is_deleted_misrecognition = body.isDeletedMisrecognition;

    if (body.exposedChannelName !== undefined && body.exposedChannelName !== existing.exposed_channel_name) {
      patch.exposed_channel_name = body.exposedChannelName;
      // 채널명이 바뀌면 매칭을 다시 시도한다 (사용자가 직접 지정한 matchedChannelId가 없을 때만).
      if (body.matchedChannelId === undefined) {
        const team = await db("teams").where({ id: investigation.team_id }).first();
        const match = await matchChannel({
          companyId: team.company_id,
          platform: guessPlatform(body.channelTypeGuess ?? existing.channel_type_guess),
          exposedChannelName: body.exposedChannelName,
          channelIdOrUrl: null,
        });
        patch.matched_channel_id = match.matchedChannelId;
        patch.match_method = match.matchMethod;
        patch.match_confidence = match.matchConfidence;
      }
    }
    if (body.matchedChannelId !== undefined) {
      patch.matched_channel_id = body.matchedChannelId;
      patch.match_method = "MANUAL";
      patch.match_confidence = null;
    }

    await db("posts").where({ id: req.params.postId }).update(patch);
    res.json({ post: toCamel(await db("posts").where({ id: req.params.postId }).first()) });
  })
);

const manualPostSchema = z.object({
  exposedChannelName: z.string().default(""),
  titleText: z.string().default(""),
  channelTypeGuess: z
    .enum(["OWN_HOMEPAGE", "OWN_BLOG", "CAFE", "KIN", "TISTORY", "APP", "BLOG", "OTHER", "UNCLASSIFIED"])
    .default("UNCLASSIFIED"),
  groupId: z.string().nullable().optional(),
});

tabAnalysesRouter.post(
  "/:id/posts",
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    assertNotSaved(tab);
    const body = manualPostSchema.parse(req.body);
    const maxOrder = await db("posts").where({ tab_analysis_id: tab.id }).max<{ max: number }>("original_order as max").first();
    const id = newId();
    await db("posts").insert({
      id,
      tab_analysis_id: tab.id,
      uploaded_image_id: null,
      group_id: body.groupId ?? null,
      original_order: (maxOrder?.max ?? 0) + 1,
      analysis_rank: null,
      included_in_top10: false,
      is_deleted_misrecognition: false,
      is_manually_added: true,
      channel_type_guess: body.channelTypeGuess,
      exposed_channel_name: body.exposedChannelName,
      title_text: body.titleText,
      match_method: "NONE",
      content_type: null,
      related_365mc: null,
      branch_status: "NOT_APPLICABLE",
      branch_source: "AUTO",
      content_type_source: "AUTO",
      created_at: new Date(),
      updated_at: new Date(),
    });
    res.status(201).json({ post: toCamel(await db("posts").where({ id }).first()) });
  })
);

tabAnalysesRouter.delete(
  "/:id/posts/:postId",
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    assertNotSaved(tab);
    await db("posts").where({ id: req.params.postId, tab_analysis_id: tab.id, is_manually_added: true }).delete();
    res.json({ ok: true });
  })
);

// ---- TOP10 계산 (모듈/채널 필터 적용) ----

const CHANNEL_TYPE_VALUES = [
  "OWN_HOMEPAGE", "OWN_BLOG", "CAFE", "KIN", "TISTORY", "APP", "BLOG", "OTHER", "UNCLASSIFIED",
] as const;

const computeTop10Schema = z.object({
  excludedGroupIds: z.array(z.string()).default([]),
  // 7절: 일반 게시글 안에서 블로그/카페/지식iN/앱/티스토리/자사 홈페이지/자사 블로그/기타/미분류를
  // 각각 포함/제외할 수 있어야 한다. 이 필터는 그룹이 GENERAL_SOURCE이거나(통합탭) 그룹이 아예
  // 없는 경우(블로그탭)에만 적용된다 — 비게시물 MODULE 그룹에는 적용되지 않는다.
  excludedChannelTypes: z.array(z.enum(CHANNEL_TYPE_VALUES)).default([]),
});

tabAnalysesRouter.post(
  "/:id/compute-top10",
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    assertNotSaved(tab);
    const body = computeTop10Schema.parse(req.body);
    const excluded = new Set(body.excludedGroupIds);
    const excludedChannelTypes = new Set(body.excludedChannelTypes);

    const posts = await db("posts").where({ tab_analysis_id: tab.id });
    const modules = await db("detected_modules").where({ tab_analysis_id: tab.id });
    const moduleById = new Map(modules.map((m) => [m.id, m]));

    const rankable = posts.map((p) => {
      const group = p.group_id ? moduleById.get(p.group_id) : null;
      const isGeneralSource = !group || group.kind === "GENERAL_SOURCE";
      const groupIncluded =
        (!p.group_id || !excluded.has(p.group_id)) &&
        !(isGeneralSource && excludedChannelTypes.has(p.channel_type_guess));
      const groupIsPostBearing = group ? group.is_post_bearing : true;
      return {
        id: p.id,
        originalOrder: p.original_order,
        isDeletedMisrecognition: p.is_deleted_misrecognition,
        groupIncluded,
        groupIsPostBearing,
      };
    });

    const ranked = computeTop10(rankable);

    await db.transaction(async (trx) => {
      for (const r of ranked) {
        await trx("posts")
          .where({ id: r.id })
          .update({ analysis_rank: r.analysisRank, included_in_top10: r.includedInTop10, updated_at: new Date() });
      }
      const top10Count = ranked.filter((r) => r.includedInTop10).length;
      // 감지 모듈의 포함 여부 스냅샷을 저장 (보고서 기준 재현용)
      await trx("tab_analyses")
        .where({ id: tab.id })
        .update({
          module_filter_json: JSON.stringify({
            excludedGroupIds: Array.from(excluded),
            excludedChannelTypes: Array.from(excludedChannelTypes),
          }),
          status: "CLASSIFYING",
          reviewed_at: new Date(),
          complete: top10Count >= 10,
          updated_at: new Date(),
        });
      for (const gid of excluded) {
        await trx("detected_modules").where({ id: gid }).update({ included_by_default: false });
      }
    });

    const updatedPosts = await db("posts").where({ tab_analysis_id: tab.id }).orderBy("original_order");
    const updatedTab = await db("tab_analyses").where({ id: tab.id }).first();
    res.json({ posts: toCamel(updatedPosts), tabAnalysis: toCamel(updatedTab) });
  })
);

// ---- 콘텐츠 분류 / 365mc 관련 / 지점 검수 ----

const classificationSchema = z.object({
  contentType: z.enum(["BRANDED", "REVIEW", "INFORMATIONAL", "COMPETITOR"]).nullable().optional(),
  related365mc: z.boolean().nullable().optional(),
  branchId: z.string().nullable().optional(),
  branchStatus: z.enum(["CONFIRMED", "PENDING", "NOT_APPLICABLE"]).optional(),
});

tabAnalysesRouter.patch(
  "/:id/posts/:postId/classification",
  asyncHandler(async (req, res) => {
    // 12절: 저장 이후에도 분류/365mc/지점은 재편집 가능해야 하므로, 다른 필드와 달리
    // 이 엔드포인트만 SAVED 상태에서도 허용한다 (변경 이력은 audit_logs에 남는다).
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    const existing = await db("posts").where({ id: req.params.postId, tab_analysis_id: tab.id }).first();
    if (!existing) throw new ApiError(404, "POST_NOT_FOUND", "게시물을 찾을 수 없습니다.");
    const body = classificationSchema.parse(req.body);

    const patch: Record<string, unknown> = { updated_at: new Date(), last_edited_by_id: req.user!.id };
    if (body.contentType !== undefined) {
      patch.content_type = body.contentType;
      patch.content_type_source = "MANUAL";
    }
    if (body.related365mc !== undefined) patch.related_365mc = body.related365mc;
    if (body.branchId !== undefined) {
      patch.branch_id = body.branchId;
      patch.branch_source = "MANUAL";
      patch.branch_status = body.branchId ? "CONFIRMED" : body.related365mc === false ? "NOT_APPLICABLE" : "PENDING";
    }
    if (body.branchStatus !== undefined) patch.branch_status = body.branchStatus;

    for (const field of ["content_type", "related_365mc", "branch_id", "branch_status"] as const) {
      if (field in patch && patch[field] !== (existing as any)[field]) {
        await recordAudit({
          entityType: "Post",
          entityId: existing.id,
          field,
          oldValue: (existing as any)[field],
          newValue: patch[field],
          userId: req.user!.id,
        });
      }
    }

    await db("posts").where({ id: req.params.postId }).update(patch);
    res.json({ post: toCamel(await db("posts").where({ id: req.params.postId }).first()) });
  })
);

tabAnalysesRouter.post(
  "/:id/confirm-classification",
  asyncHandler(async (req, res) => {
    const { tab } = await loadTabAnalysisOrThrow(req.params.id, req.user!);
    assertNotSaved(tab);
    const top10Posts = await db("posts").where({ tab_analysis_id: tab.id, included_in_top10: true });
    const problems: string[] = [];
    for (const p of top10Posts) {
      if (!p.title_text || !p.title_text.trim()) problems.push(`${p.analysis_rank}위: 제목이 비어 있습니다.`);
      if (p.content_type === null) problems.push(`${p.analysis_rank}위: 콘텐츠 유형이 미지정입니다.`);
      if (p.related_365mc === null) problems.push(`${p.analysis_rank}위: 365mc 관련 여부가 미지정입니다.`);
      if (p.related_365mc === true && p.branch_status === "NOT_APPLICABLE") {
        problems.push(`${p.analysis_rank}위: 365mc 관련 게시물의 지점 상태가 지정되지 않았습니다.`);
      }
    }
    if (problems.length > 0) {
      throw new ApiError(400, "CLASSIFICATION_INCOMPLETE", problems.join(" / "));
    }
    await db("tab_analyses").where({ id: tab.id }).update({ classification_confirmed_at: new Date(), updated_at: new Date() });
    res.json({ ok: true });
  })
);
