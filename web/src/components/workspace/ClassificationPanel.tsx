import { useEffect, useState } from "react";
import { Post, ContentType, Branch } from "../../types";
import { tabAnalysesApi, channelsApi } from "../../api";

const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  BRANDED: "브랜디드",
  REVIEW: "후기성",
  INFORMATIONAL: "정보성",
  COMPETITOR: "타업체",
};

const MATCH_METHOD_LABEL: Record<string, string> = {
  URL_ID: "URL/ID 일치",
  PLATFORM_NAME: "채널명 일치",
  ALIAS: "별칭 일치",
  FUZZY: "유사 매칭",
  MANUAL: "수동 지정",
  NONE: "매칭 없음",
};

interface Props {
  tabAnalysisId: string;
  posts: Post[];
  disabled: boolean;
  confirmed: boolean;
  onRefresh: () => void;
  onConfirmed: () => void;
}

export function ClassificationPanel({ tabAnalysisId, posts, disabled, confirmed, onRefresh, onConfirmed }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    channelsApi.branches().then((r) => setBranches(r.branches));
  }, []);

  const top10 = posts.filter((p) => p.includedInTop10).sort((a, b) => (a.analysisRank ?? 0) - (b.analysisRank ?? 0));

  async function handleConfirm() {
    setError(null);
    setConfirming(true);
    try {
      await tabAnalysesApi.confirmClassification(tabAnalysisId);
      onConfirmed();
    } catch (err: any) {
      setError(err.message ?? "확인 처리 중 오류가 발생했습니다.");
    } finally {
      setConfirming(false);
    }
  }

  if (top10.length === 0) {
    return <div className="text-slate-400 text-sm">TOP10을 먼저 추출하세요.</div>;
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">콘텐츠 분류 / 365mc 관련 여부 / 지점 검수</h3>
      {top10.map((post) => (
        <ClassificationRow key={post.id} tabAnalysisId={tabAnalysisId} post={post} branches={branches} disabled={disabled} onRefresh={onRefresh} />
      ))}

      {error && <div className="text-sm text-red-600">{error}</div>}
      {confirmed ? (
        <div className="badge bg-green-50 text-green-700">분류·지점 검수 확인 완료</div>
      ) : (
        !disabled && (
          <button className="btn-primary" onClick={handleConfirm} disabled={confirming}>
            {confirming ? "확인 중..." : "전체 분류·지점 검수 확인"}
          </button>
        )
      )}
    </div>
  );
}

function ClassificationRow({
  tabAnalysisId, post, branches, disabled, onRefresh,
}: { tabAnalysisId: string; post: Post; branches: Branch[]; disabled: boolean; onRefresh: () => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<any[]>([]);

  async function setContentType(v: ContentType) {
    await tabAnalysesApi.updateClassification(tabAnalysisId, post.id, { contentType: v });
    onRefresh();
  }
  async function setRelated(v: boolean) {
    await tabAnalysesApi.updateClassification(tabAnalysisId, post.id, { related365mc: v });
    onRefresh();
  }
  async function setBranch(branchId: string) {
    await tabAnalysesApi.updateClassification(tabAnalysisId, post.id, { branchId: branchId || null });
    onRefresh();
  }
  async function markPending() {
    await tabAnalysesApi.updateClassification(tabAnalysisId, post.id, { branchId: null, branchStatus: "PENDING" });
    onRefresh();
  }

  async function searchChannels(q: string) {
    setSearch(q);
    if (!q.trim()) return setCandidates([]);
    const res = await channelsApi.list({ query: q });
    setCandidates(res.channels.slice(0, 8));
  }

  async function pickChannel(channelId: string) {
    await tabAnalysesApi.updatePost(tabAnalysisId, post.id, { matchedChannelId: channelId });
    setPickerOpen(false);
    onRefresh();
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-medium">{post.analysisRank}위 · {post.exposedChannelName}</div>
        <div className="text-xs text-slate-400">
          매칭: {MATCH_METHOD_LABEL[post.matchMethod]}
          {post.matchConfidence !== null && ` (${Math.round(post.matchConfidence * 100)}%)`}
          {!disabled && (
            <button type="button" className="ml-2 text-blue-600 underline" onClick={() => setPickerOpen((v) => !v)}>
              다른 채널로 연결
            </button>
          )}
        </div>
      </div>
      <div className="text-sm text-slate-600">{post.titleText}</div>

      {pickerOpen && (
        <div className="border border-slate-200 rounded p-2">
          <input className="input mb-2" placeholder="채널 검색" value={search} onChange={(e) => searchChannels(e.target.value)} />
          <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
            {candidates.map((c) => (
              <li key={c.id}>
                <button type="button" className="text-blue-600 underline" onClick={() => pickChannel(c.id)}>
                  {c.exposedName} ({c.segment})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">콘텐츠 유형</label>
          {/* 12절: 저장 이후에도 분류/365mc/지점은 재편집 가능해야 하므로 이 필드들은 disabled를 적용하지 않는다. */}
          <select className="input" value={post.contentType ?? ""} onChange={(e) => setContentType(e.target.value as ContentType)}>
            <option value="" disabled>선택</option>
            {Object.entries(CONTENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">365mc 관련 여부</label>
          <div className="flex gap-3 mt-1.5">
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" checked={post.related365mc === true} onChange={() => setRelated(true)} /> 관련
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" checked={post.related365mc === false} onChange={() => setRelated(false)} /> 무관
            </label>
          </div>
        </div>
        <div>
          <label className="label">지점</label>
          {post.related365mc ? (
            <div className="flex gap-2">
              <select className="input" value={post.branchId ?? ""} onChange={(e) => setBranch(e.target.value)}>
                <option value="">지점 확인중</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {post.branchId && (
                <button type="button" className="text-xs text-slate-500 underline shrink-0" onClick={markPending}>
                  확인중으로
                </button>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-400 pt-2">해당없음</div>
          )}
          {post.related365mc && post.branchStatus === "PENDING" && (
            <div className="text-xs text-amber-600 mt-1">지점 확인중</div>
          )}
        </div>
      </div>
    </div>
  );
}
