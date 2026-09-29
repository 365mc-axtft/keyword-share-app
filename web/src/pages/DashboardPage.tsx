import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { dashboardApi, keywordsApi } from "../api";
import { useAppStore } from "../state/store";
import { KeywordGroup } from "../types";

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const CONTENT_TYPE_LABEL: Record<string, string> = {
  BRANDED: "브랜디드", REVIEW: "후기성", INFORMATIONAL: "정보성", COMPETITOR: "타업체",
};

export function DashboardPage() {
  const { currentTeamId } = useAppStore();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [keywordGroupId, setKeywordGroupId] = useState("");
  const [tabType, setTabType] = useState("");
  const [searchEnvironment, setSearchEnvironment] = useState("");
  const [groups, setGroups] = useState<KeywordGroup[]>([]);
  const [data, setData] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTeamId) return;
    keywordsApi.groups(currentTeamId).then((r) => setGroups(r.groups));
  }, [currentTeamId]);

  useEffect(() => {
    if (!currentTeamId) return;
    const params = { teamId: currentTeamId, yearMonth, keywordGroupId: keywordGroupId || undefined, tabType: tabType || undefined, searchEnvironment: searchEnvironment || undefined };
    dashboardApi.get(params).then(setData).catch((e) => setError(e.message));
    dashboardApi.savedRecords(params).then((r) => setRecords(r.records)).catch(() => {});
  }, [currentTeamId, yearMonth, keywordGroupId, tabType, searchEnvironment]);

  if (!currentTeamId) return <div className="text-slate-500">먼저 팀을 선택하세요.</div>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">대시보드</h1>
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="card flex flex-wrap gap-3">
        <input className="input w-40" type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
        <select className="input w-48" value={keywordGroupId} onChange={(e) => setKeywordGroupId(e.target.value)}>
          <option value="">전체 키워드그룹</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select className="input w-40" value={tabType} onChange={(e) => setTabType(e.target.value)}>
          <option value="">전체 탭</option>
          <option value="BLOG">블로그탭</option>
          <option value="INTEGRATED">통합검색탭</option>
        </select>
        <select className="input w-32" value={searchEnvironment} onChange={(e) => setSearchEnvironment(e.target.value)}>
          <option value="">전체 환경</option>
          <option value="MOBILE">모바일</option>
          <option value="PC">PC</option>
        </select>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="조사 건수" value={`${data.summary.investigationTotal}건`} />
            <StatCard label="저장 완료" value={`${data.summary.savedCount}건`} />
            <StatCard label="검수 필요" value={`${data.summary.needsReviewCount}건`} />
            <StatCard
              label="전체 365mc 관련 점유율"
              value={data.aggregate.overallShare.percentage === null ? "집계 전" : `${data.aggregate.overallShare.percentage}%`}
              sub={data.monthOverMonth?.comparable ? `전월 대비 ${data.monthOverMonth.diffPp > 0 ? "+" : ""}${data.monthOverMonth.diffPp}%p` : data.monthOverMonth?.note}
            />
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">지점별 점유율 (완료된 분석 {data.aggregate.tabAnalysisCount}개 · 총 {data.aggregate.totalSlots}슬롯)</h3>
            {data.aggregate.branchShares.length === 0 ? (
              <div className="text-slate-400 text-sm">확정된 지점 데이터가 없습니다.</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500 border-b"><th className="py-1">지점</th><th>관련 슬롯</th><th>점유율</th></tr></thead>
                <tbody>
                  {data.aggregate.branchShares.map((b: any) => (
                    <tr key={b.branchId} className="border-b border-slate-100">
                      <td className="py-1">{b.branchName}</td>
                      <td>{b.relatedSlots}</td>
                      <td>{b.share.percentage ?? "집계 전"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.aggregate.pendingBranchSlots > 0 && (
              <div className="text-amber-600 text-sm mt-2">지점 확인중 슬롯 {data.aggregate.pendingBranchSlots}개</div>
            )}
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">콘텐츠 유형 분포</h3>
            <div className="flex gap-4 text-sm">
              {Object.entries(CONTENT_TYPE_LABEL).map(([k, v]) => (
                <div key={k}>{v}: {data.aggregate.contentTypeCounts[k] ?? 0}건</div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="card">
        <h3 className="font-semibold mb-3">저장 기록</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500 border-b"><th className="py-1">키워드</th><th>조사일</th><th>탭</th><th>완료</th><th></th></tr></thead>
          <tbody>
            {records.map((r: any) => (
              <tr key={r.tabAnalysisId} className="border-b border-slate-100">
                <td className="py-1">{r.keywordText}</td>
                <td>{r.investigationDate}</td>
                <td>{r.tabType === "BLOG" ? "블로그" : "통합검색"}</td>
                <td>{r.complete ? "완료" : "미완료(10개 미만)"}</td>
                <td><Link className="text-blue-600 underline" to={`/investigations/${r.investigationId}`}>열기</Link></td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-3">저장된 기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}
