import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { investigationsApi, keywordsApi, teamsApi } from "../api";
import { useAppStore } from "../state/store";
import { KeywordGroup, Team } from "../types";
import { ApiClientError } from "../api/client";

export function NewInvestigationPage() {
  const { currentTeamId } = useAppStore();
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [groups, setGroups] = useState<KeywordGroup[]>([]);
  const [keywordText, setKeywordText] = useState("");
  const [keywordGroupId, setKeywordGroupId] = useState("");
  const [investigationDate, setInvestigationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchEnvironment, setSearchEnvironment] = useState<"MOBILE" | "PC">("MOBILE");
  const [tabsRequested, setTabsRequested] = useState<"BLOG" | "INTEGRATED" | "BOTH">("BOTH");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentTeamId) return;
    keywordsApi.groups(currentTeamId).then((r) => setGroups(r.groups));
    teamsApi.list().then((r) => {
      const t = r.teams.find((t) => t.id === currentTeamId) ?? null;
      setTeam(t);
      if (t?.defaultSearchEnv) setSearchEnvironment(t.defaultSearchEnv);
      if (t?.defaultSearchTab) setTabsRequested(t.defaultSearchTab);
      if (t?.defaultKeywordGroupId) setKeywordGroupId(t.defaultKeywordGroupId);
    });
  }, [currentTeamId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTeamId) {
      setError("먼저 팀을 선택하거나 생성하세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await investigationsApi.create({
        teamId: currentTeamId,
        keywordText,
        keywordGroupId: keywordGroupId || null,
        investigationDate,
        searchEnvironment,
        tabsRequested,
        saveAsTeamDefault: saveAsDefault,
      });
      navigate(`/investigations/${res.investigation.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "조사 등록 실패");
    } finally {
      setLoading(false);
    }
  }

  if (!currentTeamId) {
    return <div className="text-slate-500">먼저 팀 관리에서 팀을 만들고 선택하세요.</div>;
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-4">새 분석 등록</h1>
      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div>
          <label className="label">키워드 (자동 인식값은 제안일 뿐, 여기서 직접 확정)</label>
          <input className="input" value={keywordText} onChange={(e) => setKeywordText(e.target.value)} required />
        </div>
        <div>
          <label className="label">키워드그룹</label>
          <select className="input" value={keywordGroupId} onChange={(e) => setKeywordGroupId(e.target.value)}>
            <option value="">선택 안 함</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">조사 날짜 (게시물 작성일과 별개)</label>
          <input className="input" type="date" value={investigationDate} onChange={(e) => setInvestigationDate(e.target.value)} required />
        </div>
        <div>
          <label className="label">검색 환경</label>
          <div className="flex gap-4">
            {(["MOBILE", "PC"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1 text-sm">
                <input type="radio" checked={searchEnvironment === v} onChange={() => setSearchEnvironment(v)} />
                {v === "MOBILE" ? "모바일" : "PC"}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label">검색 탭</label>
          <div className="flex gap-4">
            {[
              { v: "BLOG", label: "블로그탭만" },
              { v: "INTEGRATED", label: "통합검색탭만" },
              { v: "BOTH", label: "둘 다" },
            ].map((opt) => (
              <label key={opt.v} className="flex items-center gap-1 text-sm">
                <input type="radio" checked={tabsRequested === opt.v} onChange={() => setTabsRequested(opt.v as any)} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} />
          이 선택을 현재 팀의 기본값으로 저장
        </label>
        <button className="btn-primary" disabled={loading}>{loading ? "등록 중..." : "등록하고 업로드로 이동"}</button>
      </form>
    </div>
  );
}
