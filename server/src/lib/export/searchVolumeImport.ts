import ExcelJS from "exceljs";

export interface ParsedVolumeRow {
  rowNumber: number;
  keywordText: string;
  volume: number;
}

export interface ParseResult {
  rows: ParsedVolumeRow[];
  errors: string[];
}

/** 검색량 엑셀 업로드 파서. 1행: 헤더(키워드, 검색량), 이후 데이터 행. */
export async function parseSearchVolumeExcel(buffer: Buffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const sheet = wb.worksheets[0];
  if (!sheet) return { rows: [], errors: ["시트를 찾을 수 없습니다."] };

  const rows: ParsedVolumeRow[] = [];
  const errors: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // 헤더
    const keyword = String(row.getCell(1).value ?? "").trim();
    const volumeRaw = row.getCell(2).value;
    if (!keyword && (volumeRaw === null || volumeRaw === undefined || volumeRaw === "")) return; // 빈 행 무시
    if (!keyword) {
      errors.push(`${rowNumber}행: 키워드가 비어 있습니다.`);
      return;
    }
    const volume = Number(volumeRaw);
    if (!Number.isFinite(volume) || volume < 0) {
      errors.push(`${rowNumber}행(${keyword}): 검색량 값이 올바르지 않습니다 (${volumeRaw}).`);
      return;
    }
    rows.push({ rowNumber, keywordText: keyword, volume: Math.round(volume) });
  });

  return { rows, errors };
}
