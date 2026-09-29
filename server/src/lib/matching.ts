import { db } from "../db";
import { normalizeChannelKey, similarity } from "./normalize";

export interface MatchResult {
  matchedChannelId: string | null;
  matchMethod: "URL_ID" | "PLATFORM_NAME" | "ALIAS" | "FUZZY" | "MANUAL" | "NONE";
  matchConfidence: number | null;
}

const FUZZY_THRESHOLD = 0.82; // 애매하면 사람이 결정 — 임계값 아래는 후보 없음(NONE)로 남김

/**
 * 채널 리스트 매칭 우선순위 (13절): URL/ID > 플랫폼+노출채널명 > 별칭 > 유사매칭 > 사용자 확인.
 * 캡처에 보이는 노출 채널명이 중심이며, 내부 닉네임으로는 매칭하지 않는다.
 */
export async function matchChannel(params: {
  companyId: string;
  platform: string;
  exposedChannelName: string;
  channelIdOrUrl?: string | null;
}): Promise<MatchResult> {
  const { companyId, platform, exposedChannelName, channelIdOrUrl } = params;

  // 1) URL/ID 매칭
  if (channelIdOrUrl) {
    const key = normalizeChannelKey(channelIdOrUrl);
    if (key) {
      const byKey = await db("channels")
        .where({ company_id: companyId, platform, normalized_key: key, active: true })
        .first();
      if (byKey) {
        return { matchedChannelId: byKey.id, matchMethod: "URL_ID", matchConfidence: 1 };
      }
    }
  }

  // 2) 플랫폼 + 노출 채널명 (정확히 일치)
  if (exposedChannelName) {
    const byName = await db("channels")
      .where({ company_id: companyId, platform, active: true })
      .whereRaw("lower(exposed_name) = lower(?)", [exposedChannelName.trim()])
      .first();
    if (byName) {
      return { matchedChannelId: byName.id, matchMethod: "PLATFORM_NAME", matchConfidence: 0.95 };
    }
  }

  // 3) 별칭
  if (exposedChannelName) {
    const byAlias = await db("channel_aliases as ca")
      .join("channels as c", "c.id", "ca.channel_id")
      .where({ "c.company_id": companyId, "c.platform": platform, "c.active": true })
      .whereRaw("lower(ca.alias) = lower(?)", [exposedChannelName.trim()])
      .select("c.id")
      .first();
    if (byAlias) {
      return { matchedChannelId: byAlias.id, matchMethod: "ALIAS", matchConfidence: 0.9 };
    }
  }

  // 4) 유사매칭 (후보 제안 수준 — 임계값 이상만)
  if (exposedChannelName) {
    const candidates = await db("channels")
      .where({ company_id: companyId, platform, active: true })
      .select("id", "exposed_name");
    let best: { id: string; score: number } | null = null;
    for (const c of candidates) {
      const score = similarity(exposedChannelName, c.exposed_name);
      if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
        best = { id: c.id, score };
      }
    }
    if (best) {
      return { matchedChannelId: best.id, matchMethod: "FUZZY", matchConfidence: best.score };
    }
  }

  // 5) 자동 매칭 실패 — 사람이 결정
  return { matchedChannelId: null, matchMethod: "NONE", matchConfidence: null };
}
