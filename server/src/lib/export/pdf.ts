import PDFDocument from "pdfkit";
import path from "node:path";
import { ReportData } from "../reportData";

const FONT_REGULAR = path.join(__dirname, "../../../assets/fonts/NanumGothic.ttf");
const FONT_BOLD = path.join(__dirname, "../../../assets/fonts/NanumGothicBold.ttf");

const contentTypeLabel: Record<string, string> = {
  BRANDED: "브랜디드",
  REVIEW: "후기성",
  INFORMATIONAL: "정보성",
  COMPETITOR: "타업체",
};

/** 한국어 폰트/줄바꿈/표 폭/페이지 나눔을 확인하며 월간 보고서 PDF를 생성한다 (15절). */
export function buildReportPdf(data: ReportData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  doc.registerFont("kr", FONT_REGULAR);
  doc.registerFont("kr-bold", FONT_BOLD);
  doc.font("kr");

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc.font("kr-bold").fontSize(18).text(`${data.teamName} — ${data.yearMonth} 월간 보고서`, { align: "left" });
  doc.moveDown(0.3);
  doc.font("kr").fontSize(9).fillColor("#666").text(`생성 시각: ${data.generatedAt}`);
  doc.fillColor("#000");
  doc.moveDown(1);

  doc.font("kr-bold").fontSize(13).text("1. 조사 기준");
  doc.font("kr").fontSize(10);
  doc.text(`기준 월: ${data.yearMonth}`);
  doc.text(`조사 조건: ${JSON.stringify(data.criteria)}`);
  doc.moveDown(1);

  doc.font("kr-bold").fontSize(13).text("2. 전체 점유율");
  doc.font("kr").fontSize(10);
  doc.text(`완료된 분석(탭) 수: ${data.aggregate.tabAnalysisCount}개 (전체 슬롯 ${data.aggregate.totalSlots}개)`);
  doc.text(
    `365mc 관련 점유율: ${
      data.aggregate.overallShare.percentage === null ? "집계 전/자료 없음" : `${data.aggregate.overallShare.percentage}%`
    } (관련 슬롯 ${data.aggregate.relatedSlots}개)`
  );
  doc.text(
    `전월 대비: ${
      data.monthOverMonth.comparable ? `${data.monthOverMonth.diffPp! > 0 ? "+" : ""}${data.monthOverMonth.diffPp}%p` : data.monthOverMonth.note ?? "비교 불가"
    }`
  );
  doc.text(`지점 확인중 슬롯: ${data.aggregate.pendingBranchSlots}개`);
  doc.moveDown(1);

  doc.font("kr-bold").fontSize(13).text("3. 지점별 점유율");
  doc.font("kr").fontSize(10);
  if (data.aggregate.branchShares.length === 0) {
    doc.text("확정된 지점 데이터가 없습니다.");
  } else {
    for (const b of data.aggregate.branchShares) {
      doc.text(`- ${b.branchName}: ${b.relatedSlots}슬롯, ${b.share.percentage ?? "집계 전"}%`);
    }
  }
  doc.moveDown(1);

  doc.font("kr-bold").fontSize(13).text("4. 콘텐츠 유형 분포");
  doc.font("kr").fontSize(10);
  const entries = Object.entries(data.aggregate.contentTypeCounts);
  if (entries.length === 0) doc.text("데이터 없음");
  for (const [type, count] of entries) {
    doc.text(`- ${contentTypeLabel[type] ?? type}: ${count}건`);
  }
  doc.moveDown(1);

  doc.font("kr-bold").fontSize(13).text("5. 키워드별 TOP10 매트릭스");
  doc.font("kr").fontSize(9);
  for (const row of data.keywordTop10) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 100) doc.addPage();
    doc.font("kr-bold").fontSize(10).text(`${row.keywordText} · ${row.tabType === "BLOG" ? "블로그" : "통합검색"} · ${row.investigationDate}`);
    doc.font("kr").fontSize(9);
    row.slots.forEach((slot, idx) => {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 30) doc.addPage();
      const line = slot ? `${idx + 1}. [${slot.channelType}] ${slot.channelName} — ${slot.title}` : `${idx + 1}. (자료 없음)`;
      doc.text(line, { width: pageWidth });
    });
    doc.moveDown(0.6);
  }

  doc.addPage();
  doc.font("kr-bold").fontSize(13).text("6. 검색량");
  doc.font("kr").fontSize(10);
  if (data.searchVolumes.length === 0) doc.text("등록된 검색량이 없습니다.");
  for (const v of data.searchVolumes) {
    doc.text(`- ${v.keywordText}: ${v.volume.toLocaleString("ko-KR")} (${v.source === "MANUAL" ? "수기입력" : "엑셀업로드"})`);
  }
  doc.moveDown(1);

  doc.font("kr-bold").fontSize(13).text("7. 지점별 특이사항");
  doc.font("kr").fontSize(10);
  doc.text(data.branchNotes ?? "작성된 특이사항이 없습니다.", { width: pageWidth });
  doc.moveDown(1);

  doc.font("kr-bold").fontSize(13).text("8. 담당자 코멘트");
  doc.font("kr").fontSize(10);
  if (data.comments.length === 0) doc.text("등록된 코멘트가 없습니다.");
  for (const c of data.comments) {
    doc.text(`[${c.author} · ${c.createdAt}] ${c.body}`, { width: pageWidth });
  }
  doc.moveDown(1);

  doc.font("kr-bold").fontSize(11).text(`검토 상태: ${data.reviewStatus}`);

  return doc;
}
