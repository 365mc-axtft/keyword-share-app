import { useEffect, useRef, useState } from "react";
import { reportsApi } from "../api";
import { apiFileUrl, getToken } from "../api/client";
import { useAppStore } from "../state/store";

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthlyReportPage() {
  const { currentTeamId } = useAppStore();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [reports, setReports] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [volumeMsg, setVolumeMsg] = useState<string | null>(null);

  async function refreshList() {
    if (!currentTeamId) return;
    const r = await reportsApi.list(currentTeamId);
    setReports(r.reports);
  }

  useEffect(() => {
    refreshList();
  }, [currentTeamId]);

  async function handleGenerate() {
    if (!currentTeamId) return;
    setError(null);
    try {
      await reportsApi.upsert({ teamId: currentTeamId, yearMonth });
      await refreshList();
      openReportByYearMonth(yearMonth);
    } catch (err: any) {
      setError(err.message ?? "보고서 생성 실패");
    }
  }

  async function openReportByYearMonth(ym: string) {
    const r = reports.find((x) => x.yearMonth === ym) ?? (await reportsApi.list(currentTeamId!)).reports.find((x: any) => x.yearMonth === ym);
    if (r) openReport(r.id);
  }

  async function openReport(id: string) {
    const r = await reportsApi.get(id);
    setSelected({ id, ...r.report });
  }

  async function handlePatch(body: any) {
    if (!selected) return;
    await reportsApi.patch(selected.id, body);
    openReport(selected.id);
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !comment.trim()) return;
    await reportsApi.addComment(selected.id, comment.trim());
    setComment("");
    openReport(selected.id);
  }

  async function handleImportVolume() {
    if (!currentTeamId || !fileRef.current?.files?.[0]) return;
    setVolumeMsg(null);
    try {
      const res = await reportsApi.importSearchVolume(currentTeamId, yearMonth, fileRef.current.files[0]);
      setVolumeMsg(`검색량 ${res.created}건 생성, ${res.updated}건 갱신${res.errors.length ? ` (오류 ${res.errors.length}건: ${res.errors.join("; ")})` : ""}`);
      if (selected) openReport(selected.id);
    } catch (err: any) {
      setVolumeMsg(err.message ?? "업로드 실패");
    }
  }

  function downloadUrl(id: string, ext: string) {
    return apiFileUrl(`/reports/${id}/export.${ext}`);
  }

  async function download(id: string, ext: string) {
    const res = await fetch(downloadUrl(id, ext), { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!currentTeamId) return <div className="text-slate-500">먼저 팀을 선택하세요.</div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <h1 className="text-xl font-bold">월간 보고서</h1>
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="card flex items-end gap-3">
        <div>
          <label className="label">기준 월</label>
          <input className="input" type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={handleGenerate}>보고서 생성/갱신</button>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">검색량 업로드 (기준 월: {yearMonth})</h3>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".xlsx" />
          <button className="btn-secondary" onClick={handleImportVolume}>엑셀 업로드</button>
        </div>
        {volumeMsg && <div className="text-sm text-slate-600 mt-2">{volumeMsg}</div>}
        <p className="text-xs text-slate-400 mt-2">1행: 헤더(키워드, 검색량), 이후 데이터 행. 점유율 분모를 검색량으로 가중하지 않습니다.</p>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">보고서 목록</h3>
        <ul className="divide-y divide-slate-100 text-sm">
          {reports.map((r) => (
            <li key={r.id} className="py-2 flex justify-between items-center">
              <span>{r.yearMonth} — {r.reviewStatus}</span>
              <button className="text-blue-600 underline" onClick={() => openReport(r.id)}>열기</button>
            </li>
          ))}
          {reports.length === 0 && <li className="py-2 text-slate-400">생성된 보고서가 없습니다.</li>}
        </ul>
      </div>

      {selected && (
        <div className="card space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">{selected.teamName} — {selected.yearMonth} 상세</h3>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => download(selected.id, "xlsx")}>Excel</button>
              <button className="btn-secondary" onClick={() => download(selected.id, "pdf")}>PDF</button>
              <button className="btn-secondary" onClick={() => download(selected.id, "json")}>JSON</button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="card">전체 관련 점유율<br /><b>{selected.aggregate.overallShare.percentage ?? "집계 전"}%</b></div>
            <div className="card">전월 대비<br /><b>{selected.monthOverMonth.comparable ? `${selected.monthOverMonth.diffPp}%p` : "비교 불가"}</b></div>
            <div className="card">지점 확인중<br /><b>{selected.aggregate.pendingBranchSlots}건</b></div>
          </div>

          <div>
            <h4 className="font-medium mb-1">키워드별 TOP10 매트릭스</h4>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pr-2">키워드</th><th className="pr-2">탭</th>
                    {Array.from({ length: 10 }, (_, i) => <th key={i} className="pr-2">{i + 1}위</th>)}
                  </tr>
                </thead>
                <tbody>
                  {selected.keywordTop10.map((row: any, idx: number) => (
                    <tr key={idx} className="border-t border-slate-100 align-top">
                      <td className="pr-2 py-1">{row.keywordText}</td>
                      <td className="pr-2 py-1">{row.tabType === "BLOG" ? "블로그" : "통합"}</td>
                      {row.slots.map((s: any, i: number) => (
                        <td key={i} className="pr-2 py-1 max-w-[140px]">{s ? `${s.channelName}` : "-"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-1">지점별 특이사항 (실제 집계 기반 초안, 수정 가능)</h4>
            <textarea
              className="input"
              rows={4}
              defaultValue={selected.branchNotes ?? ""}
              onBlur={(e) => handlePatch({ branchNotesText: e.target.value })}
            />
          </div>

          <div>
            <h4 className="font-medium mb-1">검토 상태</h4>
            <select className="input w-48" value={selected.reviewStatus} onChange={(e) => handlePatch({ reviewStatus: e.target.value })}>
              <option value="DRAFT">초안</option>
              <option value="IN_REVIEW">검토중</option>
              <option value="FINAL">최종</option>
            </select>
          </div>

          <div>
            <h4 className="font-medium mb-1">담당자 코멘트</h4>
            <ul className="text-sm space-y-1 mb-2">
              {selected.comments.map((c: any, i: number) => (
                <li key={i}>[{c.author}] {c.body}</li>
              ))}
            </ul>
            <form onSubmit={handleAddComment} className="flex gap-2">
              <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="코멘트 입력" />
              <button className="btn-primary shrink-0">등록</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
