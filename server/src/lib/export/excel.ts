import ExcelJS from "exceljs";
import { ReportData } from "../reportData";

export async function buildReportWorkbook(data: ReportData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "365mc 검색 점유율 분석";
  wb.created = new Date();

  const summary = wb.addWorksheet("요약");
  summary.columns = [
    { header: "항목", key: "k", width: 28 },
    { header: "값", key: "v", width: 50 },
  ];
  summary.addRows([
    { k: "팀", v: data.teamName },
    { k: "기준 월", v: data.yearMonth },
    { k: "조사 범위(키워드그룹 등)", v: JSON.stringify(data.criteria) },
    { k: "완료 분석(탭) 수", v: data.aggregate.tabAnalysisCount },
    { k: "전체 슬롯 수", v: data.aggregate.totalSlots },
    { k: "365mc 관련 슬롯 수", v: data.aggregate.relatedSlots },
    {
      k: "전체 관련 점유율",
      v: data.aggregate.overallShare.percentage === null ? "집계 전/자료 없음" : `${data.aggregate.overallShare.percentage}%`,
    },
    {
      k: "전월 대비",
      v: data.monthOverMonth.comparable ? `${data.monthOverMonth.diffPp}%p` : data.monthOverMonth.note ?? "비교 불가",
    },
    { k: "지점 확인중 슬롯 수", v: data.aggregate.pendingBranchSlots },
    { k: "검토 상태", v: data.reviewStatus },
    { k: "생성 시각", v: data.generatedAt },
  ]);
  summary.getRow(1).font = { bold: true };

  const branchSheet = wb.addWorksheet("지점별 점유율");
  branchSheet.columns = [
    { header: "지점", key: "branch", width: 20 },
    { header: "관련 슬롯 수", key: "slots", width: 15 },
    { header: "점유율(%)", key: "pct", width: 15 },
  ];
  for (const b of data.aggregate.branchShares) {
    branchSheet.addRow({ branch: b.branchName, slots: b.relatedSlots, pct: b.share.percentage ?? "집계 전" });
  }
  branchSheet.getRow(1).font = { bold: true };

  const contentSheet = wb.addWorksheet("콘텐츠 유형 분포");
  contentSheet.columns = [
    { header: "유형", key: "type", width: 20 },
    { header: "건수", key: "count", width: 12 },
  ];
  const typeLabel: Record<string, string> = {
    BRANDED: "브랜디드",
    REVIEW: "후기성",
    INFORMATIONAL: "정보성",
    COMPETITOR: "타업체",
  };
  for (const [type, count] of Object.entries(data.aggregate.contentTypeCounts)) {
    contentSheet.addRow({ type: typeLabel[type] ?? type, count });
  }
  contentSheet.getRow(1).font = { bold: true };

  const matrixSheet = wb.addWorksheet("키워드별 TOP10");
  matrixSheet.columns = [
    { header: "키워드", key: "keyword", width: 20 },
    { header: "탭", key: "tab", width: 10 },
    { header: "조사일", key: "date", width: 14 },
    ...Array.from({ length: 10 }, (_, i) => ({ header: `${i + 1}위`, key: `r${i + 1}`, width: 34 })),
  ];
  matrixSheet.getRow(1).font = { bold: true };
  for (const row of data.keywordTop10) {
    const rowData: Record<string, string> = {
      keyword: row.keywordText,
      tab: row.tabType === "BLOG" ? "블로그" : "통합검색",
      date: row.investigationDate,
    };
    row.slots.forEach((slot, idx) => {
      rowData[`r${idx + 1}`] = slot ? `[${slot.channelType}] ${slot.channelName}\n${slot.title}` : "";
    });
    const excelRow = matrixSheet.addRow(rowData);
    excelRow.alignment = { wrapText: true, vertical: "top" };
  }

  const volumeSheet = wb.addWorksheet("검색량");
  volumeSheet.columns = [
    { header: "키워드", key: "keyword", width: 20 },
    { header: "검색량", key: "volume", width: 14 },
    { header: "출처", key: "source", width: 10 },
  ];
  volumeSheet.getRow(1).font = { bold: true };
  for (const v of data.searchVolumes) {
    volumeSheet.addRow({ keyword: v.keywordText, volume: v.volume, source: v.source === "MANUAL" ? "수기입력" : "엑셀업로드" });
  }

  if (data.branchNotes) {
    const notesSheet = wb.addWorksheet("지점별 특이사항");
    notesSheet.columns = [{ header: "내용", key: "text", width: 100 }];
    notesSheet.getRow(1).font = { bold: true };
    for (const line of data.branchNotes.split("\n")) {
      notesSheet.addRow({ text: line });
    }
  }

  if (data.comments.length > 0) {
    const commentSheet = wb.addWorksheet("담당자 코멘트");
    commentSheet.columns = [
      { header: "작성자", key: "author", width: 16 },
      { header: "내용", key: "body", width: 70 },
      { header: "작성 시각", key: "createdAt", width: 22 },
    ];
    commentSheet.getRow(1).font = { bold: true };
    for (const c of data.comments) {
      commentSheet.addRow({ author: c.author, body: c.body, createdAt: c.createdAt });
    }
  }

  return wb;
}
