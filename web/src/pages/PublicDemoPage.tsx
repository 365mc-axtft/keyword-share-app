import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { publicApi } from "../api";
import { runOcrPipeline } from "../ocr/tesseractEngine";
import { PostDraft } from "../ocr/types";

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 3절 공개 시연 모드: 로그인 없이 격리된 데모 팀 데이터만 읽기 전용으로 보여준다.
 * OCR 체험은 브라우저에서만 처리되고 서버로 전송/저장되지 않는다 — 저장은 로그인 후 가능.
 */
export function PublicDemoPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi.dashboard(currentYearMonth()).then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">365mc 검색 점유율 분석 — 공개 시연</h1>
          <Link to="/login" className="text-blue-600 underline text-sm">로그인</Link>
        </div>
        <div className="badge bg-amber-50 text-amber-700">샘플 데이터 — 실제 회사 데이터가 아닙니다</div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        {data && (
          <div className="card">
            <h3 className="font-semibold mb-2">이번 달 전체 관련 점유율 (샘플)</h3>
            <div className="text-3xl font-bold">
              {data.aggregate.overallShare.percentage === null ? "집계 전/자료 없음" : `${data.aggregate.overallShare.percentage}%`}
            </div>
            <div className="text-sm text-slate-500 mt-1">
              완료된 분석 {data.aggregate.tabAnalysisCount}건 · 전체 슬롯 {data.aggregate.totalSlots}개
            </div>
          </div>
        )}

        <OcrTryItPanel />

        <p className="text-xs text-slate-400">
          공개 시연에서는 운영 팀/채널 리스트 삭제, 전체 데이터 다운로드, 유료 OCR 호출을 제공하지 않습니다.
        </p>
      </div>
    </div>
  );
}

function OcrTryItPanel() {
  const [tabType, setTabType] = useState<"BLOG" | "INTEGRATED">("BLOG");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [posts, setPosts] = useState<PostDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setRunning(true);
    setPosts(null);
    try {
      const { segmentation } = await runOcrPipeline(file, tabType, (_stage, p) => setProgress(p));
      setPosts(segmentation.posts);
    } catch (err: any) {
      setError(err.message ?? "OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-2">무료 OCR 체험 (브라우저에서만 처리, 저장되지 않음)</h3>
      <div className="flex items-center gap-3 mb-3">
        <select className="input w-40" value={tabType} onChange={(e) => setTabType(e.target.value as any)}>
          <option value="BLOG">블로그탭 캡처</option>
          <option value="INTEGRATED">통합검색탭 캡처</option>
        </select>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
      </div>
      {running && <div className="text-sm text-slate-500">인식 중... {Math.round(progress * 100)}%</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {posts && (
        <div className="space-y-2 mt-2">
          <div className="text-sm text-slate-500">임시 인식 결과 (로그인 후 실제 팀에 저장 가능)</div>
          {posts.map((p, i) => (
            <div key={i} className="border border-slate-200 rounded p-2 text-sm">
              <div className="font-medium">{p.exposedChannelName || "(채널명 미인식)"}</div>
              <div className="text-slate-600">{p.titleText || "(제목 미인식)"}</div>
              {p.needsReview && <div className="text-amber-600 text-xs">확인 필요: {p.needsReviewReason}</div>}
            </div>
          ))}
          {posts.length === 0 && <div className="text-slate-400 text-sm">게시물을 인식하지 못했습니다.</div>}
        </div>
      )}
    </div>
  );
}
