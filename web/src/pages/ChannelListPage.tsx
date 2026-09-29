import { useEffect, useState } from "react";
import { channelsApi } from "../api";
import { Channel, Branch, Platform, ChannelSegment } from "../types";
import { ApiClientError } from "../api/client";

const PLATFORM_LABEL: Record<Platform, string> = {
  NAVER_BLOG: "네이버 블로그",
  NAVER_CAFE: "네이버 카페",
  DAUM_CAFE: "다음 카페",
  TISTORY: "티스토리",
  KIN: "지식iN",
  OWN_HOMEPAGE: "자사 홈페이지",
  APP: "앱",
  OTHER: "기타",
};

const SEGMENT_LABEL: Record<ChannelSegment, string> = {
  OWN_365MC: "365mc 자체",
  SUPPORTER_CUSTOMER: "서포터/고객",
  COMPETITOR: "타업체",
  GENERAL_INFO: "일반정보",
  UNCLASSIFIED: "미분류",
};

export function ChannelListPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [query, setQuery] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);

  async function refresh() {
    const res = await channelsApi.list({ query: query || undefined, segment: segmentFilter || undefined });
    setChannels(res.channels);
    const b = await channelsApi.branches();
    setBranches(b.branches);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [query, segmentFilter]);

  async function handleExport() {
    const res = await channelsApi.exportAll();
    const blob = new Blob([JSON.stringify(res.channels, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "channels-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">채널 리스트</h1>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={handleExport}>내보내기(JSON)</button>
          <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>채널 등록</button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="card flex gap-3">
        <input className="input" placeholder="채널명/ID/URL 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input w-56" value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)}>
          <option value="">전체 구분</option>
          {Object.entries(SEGMENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <ChannelForm
          branches={branches}
          editing={editing}
          onSaved={() => { setShowForm(false); refresh(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-3">플랫폼</th>
              <th className="py-2 pr-3">노출 채널명</th>
              <th className="py-2 pr-3">내부 닉네임</th>
              <th className="py-2 pr-3">채널ID/URL</th>
              <th className="py-2 pr-3">구분</th>
              <th className="py-2 pr-3">지점</th>
              <th className="py-2 pr-3">상태</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="py-2 pr-3">{PLATFORM_LABEL[c.platform]}</td>
                <td className="py-2 pr-3 font-medium">{c.exposedName}</td>
                <td className="py-2 pr-3 text-slate-500">{c.internalNickname ?? "-"}</td>
                <td className="py-2 pr-3 text-slate-500 max-w-xs truncate">{c.channelIdOrUrl ?? "-"}</td>
                <td className="py-2 pr-3">{SEGMENT_LABEL[c.segment]}</td>
                <td className="py-2 pr-3">{c.branchName ?? "-"}</td>
                <td className="py-2 pr-3">
                  <span className={`badge ${c.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {c.active ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="py-2 pr-3 flex gap-2">
                  <button className="text-blue-600 underline" onClick={() => { setEditing(c); setShowForm(true); }}>수정</button>
                  <button
                    className="text-slate-500 underline"
                    onClick={async () => {
                      await channelsApi.setActive(c.id, !c.active);
                      refresh();
                    }}
                  >
                    {c.active ? "비활성화" : "활성화"}
                  </button>
                </td>
              </tr>
            ))}
            {channels.length === 0 && (
              <tr><td colSpan={8} className="py-4 text-center text-slate-400">등록된 채널이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChannelForm({
  branches, editing, onSaved, onCancel,
}: { branches: Branch[]; editing: Channel | null; onSaved: () => void; onCancel: () => void }) {
  const [platform, setPlatform] = useState<Platform>(editing?.platform ?? "NAVER_BLOG");
  const [exposedName, setExposedName] = useState(editing?.exposedName ?? "");
  const [internalNickname, setInternalNickname] = useState(editing?.internalNickname ?? "");
  const [channelIdOrUrl, setChannelIdOrUrl] = useState(editing?.channelIdOrUrl ?? "");
  const [segment, setSegment] = useState<ChannelSegment>(editing?.segment ?? "UNCLASSIFIED");
  const [branchId, setBranchId] = useState(editing?.branchId ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [aliasInput, setAliasInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retroPreview, setRetroPreview] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body = {
        platform, exposedName, internalNickname: internalNickname || null,
        channelIdOrUrl: channelIdOrUrl || null, segment, branchId: branchId || null, note: note || null,
        aliases: aliasInput ? aliasInput.split(",").map((a) => a.trim()).filter(Boolean) : [],
      };
      if (editing) {
        await channelsApi.update(editing.id, body);
      } else {
        await channelsApi.create(body);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "저장 실패");
    }
  }

  async function checkRetro() {
    if (!editing) return;
    const res = await channelsApi.retroPreview(editing.id);
    setRetroPreview(res.affectedPostCount);
  }

  async function applyRetro() {
    if (!editing) return;
    const res = await channelsApi.retroApply(editing.id);
    alert(`${res.updatedCount}건의 기존 게시물에 지점 정보를 반영했습니다.`);
    setRetroPreview(null);
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <h3 className="font-semibold">{editing ? "채널 수정" : "채널 등록"}</h3>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">플랫폼</label>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            {Object.entries(PLATFORM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">채널 구분</label>
          <select className="input" value={segment} onChange={(e) => setSegment(e.target.value as ChannelSegment)}>
            {Object.entries(SEGMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">노출 채널명 (블로그명/카페명)</label>
          <input className="input" value={exposedName} onChange={(e) => setExposedName(e.target.value)} required />
        </div>
        <div>
          <label className="label">내부 닉네임</label>
          <input className="input" value={internalNickname} onChange={(e) => setInternalNickname(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">채널 ID/URL</label>
          <input className="input" value={channelIdOrUrl} onChange={(e) => setChannelIdOrUrl(e.target.value)} />
        </div>
        <div>
          <label className="label">지점</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">지점 없음/해당없음</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">별칭 (쉼표로 구분)</label>
          <input className="input" value={aliasInput} onChange={(e) => setAliasInput(e.target.value)} placeholder="예: 365mc블로그, 365엠씨" />
        </div>
        <div className="col-span-2">
          <label className="label">비고</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {editing && (
        <div className="border-t border-slate-100 pt-3 text-sm">
          <button type="button" className="btn-secondary" onClick={checkRetro}>기존 분석에 지점 변경 소급 적용 확인</button>
          {retroPreview !== null && (
            <div className="mt-2 flex items-center gap-3">
              <span>영향받는 기존 게시물: {retroPreview}건 (사용자가 직접 지정한 값은 제외)</span>
              <button type="button" className="btn-primary" onClick={applyRetro} disabled={retroPreview === 0}>적용</button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button className="btn-primary">저장</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>취소</button>
      </div>
    </form>
  );
}
