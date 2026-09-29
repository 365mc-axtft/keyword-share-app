/** 채널 URL/ID 정규화 — 채널 등록 시 중복검사와 게시물 매칭에 동일 함수를 사용한다. */
export function normalizeChannelKey(raw: string): string {
  if (!raw) return "";
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\/+$/, "");
  s = s.replace(/\?.*$/, "");
  return s;
}

export function normalizeChannelName(raw: string): string {
  if (!raw) return "";
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

/** 매우 단순한 유사도(레벤슈타인 기반) — 애매하면 사람이 결정하도록 임계값을 보수적으로 잡는다. */
export function similarity(a: string, b: string): number {
  const x = normalizeChannelName(a);
  const y = normalizeChannelName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
