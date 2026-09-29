import { useEffect, useState } from "react";
import { apiFileUrl, getToken } from "../api/client";

const cache = new Map<string, string>();

/** 이미지 서빙 엔드포인트는 인증이 필요해 <img src>로 바로 못 쓰므로, blob으로 받아 objectURL을 만든다. */
export function AuthedImage({ path, alt, style, className }: { path: string; alt?: string; style?: React.CSSProperties; className?: string }) {
  const [url, setUrl] = useState<string | null>(cache.get(path) ?? null);

  useEffect(() => {
    let revoke: string | null = null;
    if (!cache.has(path)) {
      fetch(apiFileUrl(path), { headers: { Authorization: `Bearer ${getToken()}` } })
        .then((res) => res.blob())
        .then((blob) => {
          const objUrl = URL.createObjectURL(blob);
          cache.set(path, objUrl);
          revoke = objUrl;
          setUrl(objUrl);
        })
        .catch(() => setUrl(null));
    }
    return () => {
      // 캐시로 재사용하므로 컴포넌트 언마운트 시 해제하지 않음 (재요청 방지)
    };
  }, [path]);

  if (!url) return <div className={`bg-slate-100 animate-pulse ${className ?? ""}`} style={style}>불러오는 중...</div>;
  return <img src={url} alt={alt} style={style} className={className} />;
}
