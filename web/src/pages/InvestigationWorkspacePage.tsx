import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { investigationsApi, tabAnalysesApi } from "../api";
import { Investigation, TabAnalysis, UploadedImage, DetectedModule, Post, TabType } from "../types";
import { UploadPanel } from "../components/workspace/UploadPanel";
import { ReviewPanel } from "../components/workspace/ReviewPanel";
import { ModuleFilterPanel } from "../components/workspace/ModuleFilterPanel";
import { ClassificationPanel } from "../components/workspace/ClassificationPanel";

const TAB_LABEL: Record<TabType, string> = { BLOG: "블로그탭", INTEGRATED: "통합검색탭" };
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "업로드 대기", UPLOADING: "업로드됨", OCR_PROCESSING: "OCR 처리중",
  NEEDS_REVIEW: "검수 필요", CLASSIFYING: "분류 검수중", SAVED: "저장 완료", FAILED: "실패",
};

export function InvestigationWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [tabAnalyses, setTabAnalyses] = useState<TabAnalysis[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const loadInvestigation = useCallback(async () => {
    if (!id) return;
    const res = await investigationsApi.get(id);
    setInvestigation(res.investigation);
    setTabAnalyses(res.tabAnalyses);
    setActiveTabId((cur) => cur ?? res.tabAnalyses[0]?.id ?? null);
  }, [id]);

  useEffect(() => {
    loadInvestigation().catch((e) => setError(e.message));
  }, [loadInvestigation]);

  async function handleSaveInvestigation() {
    if (!id) return;
    setError(null);
    setSaveMsg(null);
    try {
      const res = await investigationsApi.save(id);
      setSaveMsg(res.alreadySaved ? "이미 저장되어 있습니다." : "저장되었습니다.");
      loadInvestigation();
    } catch (err: any) {
      setError(err.message ?? "저장 실패");
    }
  }

  if (!investigation) return <div>불러오는 중...</div>;

  const allConfirmed = tabAnalyses.every((t) => t.classificationConfirmedAt);
  const activeTab = tabAnalyses.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">{investigation.keywordText}</h1>
        <div className="text-sm text-slate-500">
          조사일 {investigation.investigationDate} · {investigation.searchEnvironment === "MOBILE" ? "모바일" : "PC"} ·{" "}
          {investigation.tabsRequested === "BOTH" ? "블로그+통합검색" : TAB_LABEL[investigation.tabsRequested as TabType]}
          {investigation.savedAt && <span className="badge bg-green-50 text-green-700 ml-2">저장 완료</span>}
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {saveMsg && <div className="text-sm text-green-700">{saveMsg}</div>}

      {tabAnalyses.length > 1 && (
        <div className="flex gap-2 border-b border-slate-200">
          {tabAnalyses.map((t) => (
            <button
              key={t.id}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTabId === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"}`}
              onClick={() => setActiveTabId(t.id)}
            >
              {TAB_LABEL[t.tabType]} <span className="text-xs">({STATUS_LABEL[t.status]})</span>
            </button>
          ))}
        </div>
      )}

      {activeTab && <TabAnalysisSection key={activeTab.id} tabAnalysisId={activeTab.id} tabType={activeTab.tabType} onTabUpdated={loadInvestigation} />}

      <div className="card">
        <h3 className="font-semibold mb-2">조사 저장</h3>
        <p className="text-sm text-slate-500 mb-3">
          {investigation.tabsRequested === "BOTH"
            ? "두 탭 모두 분류·지점 검수 확인이 끝나야 함께 저장됩니다."
            : "분류·지점 검수 확인이 끝나야 저장됩니다."}
        </p>
        <button className="btn-primary" onClick={handleSaveInvestigation} disabled={!allConfirmed || Boolean(investigation.savedAt)}>
          {investigation.savedAt ? "저장됨" : "조사 저장"}
        </button>
      </div>
    </div>
  );
}

function TabAnalysisSection({ tabAnalysisId, tabType, onTabUpdated }: { tabAnalysisId: string; tabType: TabType; onTabUpdated: () => void }) {
  const [tab, setTab] = useState<TabAnalysis | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [modules, setModules] = useState<DetectedModule[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  const load = useCallback(async () => {
    const res = await tabAnalysesApi.get(tabAnalysisId);
    setTab(res.tabAnalysis);
    setImages(res.images);
    setModules(res.modules);
    setPosts(res.posts);
    onTabUpdated();
  }, [tabAnalysisId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!tab) return <div>탭 정보를 불러오는 중...</div>;

  const disabled = tab.status === "SAVED";
  const hasTop10 = posts.some((p) => p.includedInTop10);

  return (
    <div className="space-y-4">
      <UploadPanel tabAnalysisId={tabAnalysisId} tabType={tabType} images={images} disabled={disabled} onRefresh={load} onOcrDone={load} />

      {posts.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">게시물 결과 검수</h3>
          <ReviewPanel tabAnalysisId={tabAnalysisId} posts={posts} images={images} disabled={disabled} onRefresh={load} />
        </div>
      )}

      {posts.length > 0 && (
        <ModuleFilterPanel tabAnalysisId={tabAnalysisId} modules={modules} posts={posts} disabled={disabled} onComputed={load} />
      )}

      {hasTop10 && (
        <div className="card">
          <ClassificationPanel
            tabAnalysisId={tabAnalysisId}
            posts={posts}
            disabled={disabled}
            confirmed={Boolean(tab.classificationConfirmedAt)}
            onRefresh={load}
            onConfirmed={load}
          />
        </div>
      )}
    </div>
  );
}
