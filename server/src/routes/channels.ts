import { Router } from "express";
import { z } from "zod";
import { db, newId } from "../db";
import { requireAuth, requireGlobalAdmin } from "../middleware/auth";
import { asyncHandler, ApiError } from "../lib/asyncHandler";
import { toCamel } from "../lib/caseConvert";
import { normalizeChannelKey } from "../lib/normalize";
import { recordAudit } from "../lib/audit";

export const channelsRouter = Router();
channelsRouter.use(requireAuth);

// 채널 리스트는 회사 공용 데이터. 조회/검색은 소속 회사의 모든 팀 사용자가 가능하고,
// 등록/수정/비활성화는 팀관리자 이상으로 제한한다 (13절: 수정 권한은 서버에서 검증).
async function canEditChannels(userId: string, companyId: string, globalRole: string): Promise<boolean> {
  if (globalRole === "ADMIN") return true;
  const anyTeamAdmin = await db("team_memberships as tm")
    .join("teams as t", "t.id", "tm.team_id")
    .where({ "tm.user_id": userId, "t.company_id": companyId, "tm.role": "TEAM_ADMIN" })
    .first();
  return Boolean(anyTeamAdmin);
}

channelsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { query, platform, segment, activeOnly, branchId } = req.query as Record<string, string | undefined>;
    let q = db("channels")
      .leftJoin("branches as b", "b.id", "channels.branch_id")
      .leftJoin("brands as br", "br.id", "channels.brand_id")
      .leftJoin("competitors as co", "co.id", "channels.competitor_id")
      .where({ "channels.company_id": user.companyId });
    if (query) {
      q = q.where((b) =>
        b
          .whereRaw("lower(channels.exposed_name) like ?", [`%${query.toLowerCase()}%`])
          .orWhereRaw("lower(channels.internal_nickname) like ?", [`%${query.toLowerCase()}%`])
          .orWhereRaw("lower(channels.channel_id_or_url) like ?", [`%${query.toLowerCase()}%`])
      );
    }
    if (platform) q = q.where({ "channels.platform": platform });
    if (segment) q = q.where({ "channels.segment": segment });
    if (branchId) q = q.where({ "channels.branch_id": branchId });
    if (activeOnly === "true") q = q.where({ "channels.active": true });

    const rows = await q
      .select(
        "channels.*",
        "b.name as branch_name",
        "br.name as brand_name",
        "co.name as competitor_name"
      )
      .orderBy("channels.exposed_name");

    const ids = rows.map((r) => r.id);
    const aliases = ids.length
      ? await db("channel_aliases").whereIn("channel_id", ids)
      : [];
    const aliasByChannel = new Map<string, string[]>();
    for (const a of aliases) {
      const list = aliasByChannel.get(a.channel_id) ?? [];
      list.push(a.alias);
      aliasByChannel.set(a.channel_id, list);
    }
    const result = rows.map((r) => ({ ...r, aliases: aliasByChannel.get(r.id) ?? [] }));
    res.json({ channels: toCamel(result) });
  })
);

const channelSchema = z.object({
  platform: z.enum(["NAVER_BLOG", "NAVER_CAFE", "DAUM_CAFE", "TISTORY", "KIN", "OWN_HOMEPAGE", "APP", "OTHER"]),
  exposedName: z.string().min(1),
  internalNickname: z.string().optional().nullable(),
  channelIdOrUrl: z.string().optional().nullable(),
  segment: z
    .enum(["OWN_365MC", "SUPPORTER_CUSTOMER", "COMPETITOR", "GENERAL_INFO", "UNCLASSIFIED"])
    .default("UNCLASSIFIED"),
  brandId: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  competitorId: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  aliases: z.array(z.string()).optional().default([]),
});

channelsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!(await canEditChannels(user.id, user.companyId, user.globalRole))) {
      throw new ApiError(403, "FORBIDDEN_ROLE", "채널 등록은 팀관리자 이상만 가능합니다.");
    }
    const body = channelSchema.parse(req.body);
    const normalizedKey = normalizeChannelKey(body.channelIdOrUrl || body.exposedName);
    const dup = await db("channels")
      .where({ company_id: user.companyId, platform: body.platform, normalized_key: normalizedKey })
      .first();
    if (dup) {
      throw new ApiError(
        409,
        "CHANNEL_DUPLICATE",
        `같은 플랫폼의 동일 ID/URL 채널이 이미 있습니다: ${dup.exposed_name}`
      );
    }

    const id = newId();
    await db.transaction(async (trx) => {
      await trx("channels").insert({
        id,
        company_id: user.companyId,
        platform: body.platform,
        exposed_name: body.exposedName,
        internal_nickname: body.internalNickname ?? null,
        channel_id_or_url: body.channelIdOrUrl ?? null,
        normalized_key: normalizedKey,
        segment: body.segment,
        brand_id: body.brandId ?? null,
        branch_id: body.branchId ?? null,
        competitor_id: body.competitorId ?? null,
        note: body.note ?? null,
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: user.id,
        updated_by: user.id,
      });
      for (const alias of body.aliases) {
        if (!alias.trim()) continue;
        await trx("channel_aliases").insert({ id: newId(), channel_id: id, alias: alias.trim() });
      }
    });
    const created = await db("channels").where({ id }).first();
    res.status(201).json({ channel: toCamel(created) });
  })
);

channelsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!(await canEditChannels(user.id, user.companyId, user.globalRole))) {
      throw new ApiError(403, "FORBIDDEN_ROLE", "채널 수정은 팀관리자 이상만 가능합니다.");
    }
    const existing = await db("channels").where({ id: req.params.id, company_id: user.companyId }).first();
    if (!existing) throw new ApiError(404, "CHANNEL_NOT_FOUND", "채널을 찾을 수 없습니다.");

    const body = channelSchema.partial().parse(req.body);
    const patch: Record<string, unknown> = { updated_at: new Date(), updated_by: user.id };
    for (const [k, v] of Object.entries(body)) {
      if (k === "aliases") continue;
      const col = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      patch[col] = v;
    }
    if (body.channelIdOrUrl !== undefined || body.exposedName !== undefined) {
      const newKeySource = body.channelIdOrUrl ?? existing.channel_id_or_url ?? body.exposedName ?? existing.exposed_name;
      patch.normalized_key = normalizeChannelKey(newKeySource);
    }

    for (const field of ["exposed_name", "branch_id", "segment", "brand_id", "competitor_id"] as const) {
      if (field in patch && patch[field] !== (existing as any)[field]) {
        await recordAudit({
          entityType: "Channel",
          entityId: existing.id,
          field,
          oldValue: (existing as any)[field],
          newValue: patch[field],
          userId: user.id,
        });
      }
    }

    await db("channels").where({ id: req.params.id }).update(patch);
    res.json({ channel: toCamel(await db("channels").where({ id: req.params.id }).first()) });
  })
);

channelsRouter.post(
  "/:id/active",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!(await canEditChannels(user.id, user.companyId, user.globalRole))) {
      throw new ApiError(403, "FORBIDDEN_ROLE", "채널 활성/비활성화는 팀관리자 이상만 가능합니다.");
    }
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    await db("channels").where({ id: req.params.id, company_id: user.companyId }).update({ active, updated_at: new Date() });
    res.json({ ok: true });
  })
);

channelsRouter.post(
  "/:id/aliases",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!(await canEditChannels(user.id, user.companyId, user.globalRole))) {
      throw new ApiError(403, "FORBIDDEN_ROLE", "권한이 없습니다.");
    }
    const { alias } = z.object({ alias: z.string().min(1) }).parse(req.body);
    const channel = await db("channels").where({ id: req.params.id, company_id: user.companyId }).first();
    if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "채널을 찾을 수 없습니다.");
    const dup = await db("channel_aliases").where({ channel_id: channel.id, alias }).first();
    if (dup) throw new ApiError(409, "ALIAS_TAKEN", "이미 등록된 별칭입니다.");
    await db("channel_aliases").insert({ id: newId(), channel_id: channel.id, alias });
    res.status(201).json({ ok: true });
  })
);

channelsRouter.delete(
  "/:id/aliases/:aliasId",
  asyncHandler(async (req, res) => {
    // 이전에는 권한/회사 소속 확인이 전혀 없어, 로그인만 한 사용자라면 누구든(다른 회사
    // 사용자 포함) 채널 별칭 id를 알아내 임의로 삭제할 수 있었다. 다른 수정 엔드포인트와
    // 동일하게 팀관리자 이상 + 같은 회사 소속 채널인지를 반드시 확인한다.
    const user = req.user!;
    if (!(await canEditChannels(user.id, user.companyId, user.globalRole))) {
      throw new ApiError(403, "FORBIDDEN_ROLE", "권한이 없습니다.");
    }
    const channel = await db("channels").where({ id: req.params.id, company_id: user.companyId }).first();
    if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "채널을 찾을 수 없습니다.");
    await db("channel_aliases").where({ id: req.params.aliasId, channel_id: channel.id }).delete();
    res.json({ ok: true });
  })
);

// ---- 지점/브랜드/경쟁업체 참조 데이터 ----

channelsRouter.get(
  "/branches",
  asyncHandler(async (req, res) => {
    const rows = await db("branches").where({ company_id: req.user!.companyId }).orderBy("name");
    res.json({ branches: toCamel(rows) });
  })
);

channelsRouter.post(
  "/branches",
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const id = newId();
    await db("branches")
      .insert({ id, company_id: req.user!.companyId, name, created_at: new Date() })
      .onConflict(["company_id", "name"])
      .ignore();
    const row = await db("branches").where({ company_id: req.user!.companyId, name }).first();
    res.status(201).json({ branch: toCamel(row) });
  })
);

channelsRouter.get(
  "/brands",
  asyncHandler(async (req, res) => {
    const rows = await db("brands").where({ company_id: req.user!.companyId }).orderBy("name");
    res.json({ brands: toCamel(rows) });
  })
);

channelsRouter.post(
  "/brands",
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const id = newId();
    await db("brands")
      .insert({ id, company_id: req.user!.companyId, name })
      .onConflict(["company_id", "name"])
      .ignore();
    const row = await db("brands").where({ company_id: req.user!.companyId, name }).first();
    res.status(201).json({ brand: toCamel(row) });
  })
);

channelsRouter.get(
  "/competitors",
  asyncHandler(async (req, res) => {
    const rows = await db("competitors").where({ company_id: req.user!.companyId }).orderBy("name");
    res.json({ competitors: toCamel(rows) });
  })
);

channelsRouter.post(
  "/competitors",
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    const id = newId();
    await db("competitors")
      .insert({ id, company_id: req.user!.companyId, name })
      .onConflict(["company_id", "name"])
      .ignore();
    const row = await db("competitors").where({ company_id: req.user!.companyId, name }).first();
    res.status(201).json({ competitor: toCamel(row) });
  })
);

// ---- 내보내기 / 가져오기 ----

channelsRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const rows = await db("channels").where({ company_id: req.user!.companyId });
    res.json({ channels: toCamel(rows), exportedAt: new Date().toISOString() });
  })
);

const importRowSchema = z.object({
  platform: z.enum(["NAVER_BLOG", "NAVER_CAFE", "DAUM_CAFE", "TISTORY", "KIN", "OWN_HOMEPAGE", "APP", "OTHER"]),
  exposedName: z.string().min(1),
  internalNickname: z.string().optional().nullable(),
  channelIdOrUrl: z.string().optional().nullable(),
  segment: z
    .enum(["OWN_365MC", "SUPPORTER_CUSTOMER", "COMPETITOR", "GENERAL_INFO", "UNCLASSIFIED"])
    .optional()
    .default("UNCLASSIFIED"),
  note: z.string().optional().nullable(),
});

channelsRouter.post(
  "/import",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!(await canEditChannels(user.id, user.companyId, user.globalRole))) {
      throw new ApiError(403, "FORBIDDEN_ROLE", "채널 가져오기는 팀관리자 이상만 가능합니다.");
    }
    const { rows } = z.object({ rows: z.array(importRowSchema) }).parse(req.body);
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const normalizedKey = normalizeChannelKey(row.channelIdOrUrl || row.exposedName);
      const dup = await db("channels")
        .where({ company_id: user.companyId, platform: row.platform, normalized_key: normalizedKey })
        .first();
      if (dup) {
        skipped++;
        continue;
      }
      await db("channels").insert({
        id: newId(),
        company_id: user.companyId,
        platform: row.platform,
        exposed_name: row.exposedName,
        internal_nickname: row.internalNickname ?? null,
        channel_id_or_url: row.channelIdOrUrl ?? null,
        normalized_key: normalizedKey,
        segment: row.segment,
        note: row.note ?? null,
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: user.id,
        updated_by: user.id,
      });
      created++;
    }
    res.json({ created, skipped, errors });
  })
);

// ---- 소급 적용 (branch/segment 변경을 기존 게시물에 반영) ----

channelsRouter.get(
  "/:id/retroactive-preview",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const channel = await db("channels").where({ id: req.params.id, company_id: user.companyId }).first();
    if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "채널을 찾을 수 없습니다.");
    // 자동(AUTO) 출처로 지점이 매겨진 게시물만 소급 대상 — 사용자가 개별 지정(MANUAL)한 값은 제외
    const affected = await db("posts")
      .where({ matched_channel_id: channel.id, branch_source: "AUTO" })
      .whereNot({ branch_id: channel.branch_id ?? null })
      .count<{ count: string }[]>("id as count")
      .first();
    res.json({ affectedPostCount: Number(affected?.count ?? 0), targetBranchId: channel.branch_id });
  })
);

channelsRouter.post(
  "/:id/retroactive-apply",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!(await canEditChannels(user.id, user.companyId, user.globalRole))) {
      throw new ApiError(403, "FORBIDDEN_ROLE", "권한이 없습니다.");
    }
    const channel = await db("channels").where({ id: req.params.id, company_id: user.companyId }).first();
    if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "채널을 찾을 수 없습니다.");

    const updated = await db("posts")
      .where({ matched_channel_id: channel.id, branch_source: "AUTO" })
      .update({
        branch_id: channel.branch_id ?? null,
        branch_status: channel.branch_id ? "CONFIRMED" : "PENDING",
        updated_at: new Date(),
      });
    res.json({ updatedCount: updated });
  })
);
