import { useState } from "react";
import { DetectedModule, Post, ChannelTypeGuess } from "../../types";
import { tabAnalysesApi } from "../../api";

const CHANNEL_TYPE_LABEL: Record<ChannelTypeGuess, string> = {
  OWN_HOMEPAGE: "자사 홈페이지",
  OWN_BLOG: "자사 블로그",
  CAFE: "카페",
  KIN: "지식iN",
  TISTORY: "티스토리",
  APP: "앱",
  BLOG: "블로그",
  OTHER: "기타",
  UNCLASSIFIED: "미분류",
};

interface Props {
  tabAnalysisId: string;
  modules: DetectedModule[];
  posts: Post[];
  disabled: boolean;
  onComputed: () => void;
}

/** 7절: 감지된 모듈 종류별 체크박스로 포함/제외, 일반 게시글 안에서는 채널 종류별 포함/제외. */
export function ModuleFilterPanel({ tabAnalysisId, modules, posts, disabled, onComputed }: Props) {
  const [excludedGroups, setExcludedGroups] = useState<Set<string>>(
    () => new Set(modules.filter((m) => !m.includedByDefault).map((m) => m.id))
  );
  const [excludedChannelTypes, setExcludedChannelTypes] = useState<Set<ChannelTypeGuess>>(new Set());
  const [busy, setBusy] = useState(false);

  const generalSourceTypesPresent = Array.from(
    new Set(
      posts
        .filter((p) => {
          const group = modules.find((m) => m.id === p.groupId);
          return !group || group.kind === "GENERAL_SOURCE";
        })
        .map((p) => p.channelTypeGuess)
    )
  );

  function toggleGroup(id: string) {
    setExcludedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleChannelType(t: ChannelTypeGuess) {
    setExcludedChannelTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  async function handleCompute() {
    setBusy(true);
    try {
      await tabAnalysesApi.computeTop10(tabAnalysisId, Array.from(excludedGroups), Array.from(excludedChannelTypes));
      onComputed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold">모듈 / 채널 종류 필터</h3>

      {modules.length > 0 && (
        <div>
          <div className="text-sm text-slate-500 mb-1">감지된 모듈/그룹 (화면에서 실제로 감지된 것만 표시)</div>
          <div className="flex flex-wrap gap-3">
            {modules.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 text-sm border border-slate-200 rounded px-2 py-1">
                <input type="checkbox" checked={!excludedGroups.has(m.id)} disabled={disabled} onChange={() => toggleGroup(m.id)} />
                {m.name} ({m.detectedPostCount}건{!m.isPostBearing ? " · 비게시물" : ""})
              </label>
            ))}
          </div>
        </div>
      )}

      {generalSourceTypesPresent.length > 0 && (
        <div>
          <div className="text-sm text-slate-500 mb-1">일반 게시글 종류별 포함/제외</div>
          <div className="flex flex-wrap gap-3">
            {generalSourceTypesPresent.map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm border border-slate-200 rounded px-2 py-1">
                <input type="checkbox" checked={!excludedChannelTypes.has(t)} disabled={disabled} onChange={() => toggleChannelType(t)} />
                {CHANNEL_TYPE_LABEL[t]}
              </label>
            ))}
          </div>
        </div>
      )}

      {!disabled && (
        <button className="btn-primary" onClick={handleCompute} disabled={busy}>
          {busy ? "계산 중..." : "TOP10 추출"}
        </button>
      )}
    </div>
  );
}
