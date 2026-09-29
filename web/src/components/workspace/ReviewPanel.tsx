import { useState } from "react";
import { Post, UploadedImage, ChannelTypeGuess } from "../../types";
import { tabAnalysesApi } from "../../api";
import { OriginalPostCrop } from "../OriginalPostCrop";

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
  posts: Post[];
  images: UploadedImage[];
  disabled: boolean;
  onRefresh: () => void;
}

/**
 * 10절 "OCR 검수 화면 — 반드시 그대로 지킬 사용자 결정"을 그대로 구현.
 * [왼쪽 원본 블록] → 화살표 → [오른쪽 채널종류/채널명/제목/오인식삭제] 한 세트가 한 행이며,
 * 좌우를 분리 스크롤하지 않는다(같은 문서 흐름 안에 있으므로 자연히 함께 스크롤된다).
 */
export function ReviewPanel({ tabAnalysisId, posts, images, disabled, onRefresh }: Props) {
  const imageById = new Map(images.map((i) => [i.id, i]));
  const visible = posts.filter((p) => !p.isDeletedMisrecognition).sort((a, b) => a.originalOrder - b.originalOrder);

  return (
    <div className="space-y-3">
      {visible.map((post) => (
        <PostRow
          key={post.id}
          tabAnalysisId={tabAnalysisId}
          post={post}
          image={post.uploadedImageId ? imageById.get(post.uploadedImageId) : undefined}
          disabled={disabled}
          onRefresh={onRefresh}
        />
      ))}
      {visible.length === 0 && <div className="text-slate-400 text-sm">아직 인식된 게시물이 없습니다. 이미지를 업로드하고 OCR을 실행하세요.</div>}

      {!disabled && <ManualAddRow tabAnalysisId={tabAnalysisId} onAdded={onRefresh} />}

      {posts.some((p) => p.isDeletedMisrecognition) && (
        <details className="text-sm text-slate-400 mt-4">
          <summary className="cursor-pointer">오인식으로 삭제된 항목 ({posts.filter((p) => p.isDeletedMisrecognition).length}건)</summary>
          <ul className="mt-2 space-y-1">
            {posts.filter((p) => p.isDeletedMisrecognition).map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>{p.exposedChannelName || "(빈 채널명)"} — {p.titleText || "(빈 제목)"}</span>
                {!disabled && (
                  <button
                    className="text-blue-600 underline"
                    onClick={async () => {
                      await tabAnalysesApi.updatePost(tabAnalysisId, p.id, { isDeletedMisrecognition: false });
                      onRefresh();
                    }}
                  >
                    복구
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PostRow({ tabAnalysisId, post, image, disabled, onRefresh }: { tabAnalysisId: string; post: Post; image?: UploadedImage; disabled: boolean; onRefresh: () => void }) {
  const [channelName, setChannelName] = useState(post.exposedChannelName);
  const [title, setTitle] = useState(post.titleText);
  const bounds = post.sourceBoundsJson ? JSON.parse(post.sourceBoundsJson) : null;

  async function commitChannelName() {
    if (channelName === post.exposedChannelName) return;
    await tabAnalysesApi.updatePost(tabAnalysisId, post.id, { exposedChannelName: channelName });
    onRefresh();
  }
  async function commitTitle() {
    if (title === post.titleText) return;
    await tabAnalysesApi.updatePost(tabAnalysisId, post.id, { titleText: title });
    onRefresh();
  }
  async function changeChannelType(v: ChannelTypeGuess) {
    await tabAnalysesApi.updatePost(tabAnalysisId, post.id, { channelTypeGuess: v });
    onRefresh();
  }
  async function markMisrecognition() {
    await tabAnalysesApi.updatePost(tabAnalysisId, post.id, { isDeletedMisrecognition: true });
    onRefresh();
  }

  return (
    <div className="card flex flex-col md:flex-row items-stretch gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 mb-1">원본 (원래 순서 {post.originalOrder}번째){post.isManuallyAdded ? " · 수동 추가" : ""}</div>
        {image && bounds ? (
          <OriginalPostCrop imagePath={`/tab-analyses/${tabAnalysisId}/images/${image.id}/file`} blockTop={bounds.blockTop} blockBottom={bounds.blockBottom} />
        ) : (
          <div className="h-16 flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-300 rounded">
            원본 연결 없음 (수동 추가 항목)
          </div>
        )}
      </div>

      <div className="flex items-center justify-center text-slate-300 text-2xl px-1 md:rotate-0 rotate-90">→</div>

      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <label className="label">채널 종류</label>
          <select className="input" value={post.channelTypeGuess} disabled={disabled} onChange={(e) => changeChannelType(e.target.value as ChannelTypeGuess)}>
            {Object.entries(CHANNEL_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">노출 채널명</label>
          <input className="input" value={channelName} disabled={disabled} onChange={(e) => setChannelName(e.target.value)} onBlur={commitChannelName} />
        </div>
        <div>
          <label className="label">게시물 제목</label>
          <textarea className="input" rows={2} value={title} disabled={disabled} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} />
        </div>
        {!disabled && (
          <button className="btn-danger" onClick={markMisrecognition}>게시물이 아닌 OCR 오인식 삭제</button>
        )}
      </div>
    </div>
  );
}

function ManualAddRow({ tabAnalysisId, onAdded }: { tabAnalysisId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [title, setTitle] = useState("");
  const [channelType, setChannelType] = useState<ChannelTypeGuess>("UNCLASSIFIED");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await tabAnalysesApi.addManualPost(tabAnalysisId, { exposedChannelName: channelName, titleText: title, channelTypeGuess: channelType });
    setChannelName("");
    setTitle("");
    setOpen(false);
    onAdded();
  }

  if (!open) {
    return <button className="btn-secondary" onClick={() => setOpen(true)}>게시물 수동 추가</button>;
  }

  return (
    <form onSubmit={submit} className="card space-y-2">
      <div className="text-sm text-slate-500">원본 연결 없는 수동 추가 항목입니다.</div>
      <select className="input" value={channelType} onChange={(e) => setChannelType(e.target.value as ChannelTypeGuess)}>
        {Object.entries(CHANNEL_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input className="input" placeholder="노출 채널명" value={channelName} onChange={(e) => setChannelName(e.target.value)} required />
      <textarea className="input" placeholder="게시물 제목" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} required />
      <div className="flex gap-3">
        <button className="btn-primary">추가</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>취소</button>
      </div>
    </form>
  );
}
