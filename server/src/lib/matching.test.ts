import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, newId } from "../db";
import { matchChannel } from "./matching";

// 13절 "채널 리스트 매칭 우선순위: URL/ID > 플랫폼+노출채널명 > 별칭 > 유사매칭 > 사용자 확인"을
// 실제 DB에 채널을 등록해 놓고 검증한다.

describe("matchChannel (integration)", () => {
  const companyId = `test-company-${newId()}`;
  const channelId = newId();
  const aliasedChannelId = newId();

  beforeAll(async () => {
    await db("companies").insert({ id: companyId, name: "매칭테스트 회사", created_at: new Date() });
    await db("channels").insert({
      id: channelId,
      company_id: companyId,
      platform: "NAVER_BLOG",
      exposed_name: "365mc 강남점 블로그",
      channel_id_or_url: "https://blog.naver.com/365mc-gangnam",
      normalized_key: "blog.naver.com/365mc-gangnam",
      segment: "OWN_365MC",
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    await db("channels").insert({
      id: aliasedChannelId,
      company_id: companyId,
      platform: "NAVER_BLOG",
      exposed_name: "365mc공식블로그정식명칭",
      normalized_key: "365mc공식블로그정식명칭",
      segment: "OWN_365MC",
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    await db("channel_aliases").insert({ id: newId(), channel_id: aliasedChannelId, alias: "365mc공식블로그별칭" });
  });

  afterAll(async () => {
    await db("channel_aliases").where({ channel_id: aliasedChannelId }).delete();
    await db("channels").whereIn("id", [channelId, aliasedChannelId]).delete();
    await db("companies").where({ id: companyId }).delete();
    await db.destroy();
  });

  it("URL/ID가 정확히 일치하면 이름이 달라도 URL_ID 방식으로 최우선 매칭된다", async () => {
    const r = await matchChannel({
      companyId,
      platform: "NAVER_BLOG",
      exposedChannelName: "화면에는 다르게 보이는 이름",
      channelIdOrUrl: "https://blog.naver.com/365mc-gangnam?ref=search",
    });
    expect(r.matchedChannelId).toBe(channelId);
    expect(r.matchMethod).toBe("URL_ID");
    expect(r.matchConfidence).toBe(1);
  });

  it("URL이 없으면 플랫폼+노출채널명 정확 일치로 매칭된다", async () => {
    const r = await matchChannel({ companyId, platform: "NAVER_BLOG", exposedChannelName: "365mc 강남점 블로그" });
    expect(r.matchedChannelId).toBe(channelId);
    expect(r.matchMethod).toBe("PLATFORM_NAME");
  });

  it("등록된 별칭과 일치하면 ALIAS로 매칭된다", async () => {
    const r = await matchChannel({ companyId, platform: "NAVER_BLOG", exposedChannelName: "365mc공식블로그별칭" });
    expect(r.matchedChannelId).toBe(aliasedChannelId);
    expect(r.matchMethod).toBe("ALIAS");
  });

  it("이름이 충분히 비슷하면(임계값 이상) FUZZY로 후보를 제안한다", async () => {
    const r = await matchChannel({ companyId, platform: "NAVER_BLOG", exposedChannelName: "365mc  강남점  블로그" });
    expect(r.matchedChannelId).toBe(channelId);
    expect(r.matchMethod).toBe("FUZZY");
  });

  it("전혀 관련 없는 이름은 억지로 매칭하지 않고 NONE으로 사람 판단에 남긴다", async () => {
    const r = await matchChannel({ companyId, platform: "NAVER_BLOG", exposedChannelName: "완전히 관련없는 채널명입니다" });
    expect(r.matchedChannelId).toBeNull();
    expect(r.matchMethod).toBe("NONE");
  });

  it("다른 회사(companyId)의 동일한 이름 채널과는 절대 매칭되지 않는다 (회사 간 데이터 격리)", async () => {
    const r = await matchChannel({ companyId: "other-company", platform: "NAVER_BLOG", exposedChannelName: "365mc 강남점 블로그" });
    expect(r.matchedChannelId).toBeNull();
  });
});
