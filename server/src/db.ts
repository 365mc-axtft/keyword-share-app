import { types } from "pg";
import knexLib from "knex";
import knexConfig from "./knexfile";

// PostgreSQL DATE(OID 1082) 컬럼을 pg 드라이버 기본값(로컬 타임존 기준 JS Date)으로 파싱하면
// investigation_date 같은 "순수 달력 날짜"가 서버 타임존에 따라 하루 밀려 보일 수 있다.
// 시간/타임존 의미가 없는 값이므로 원본 "YYYY-MM-DD" 문자열 그대로 반환하도록 고정한다.
types.setTypeParser(1082, (value: string) => value);

export const db = knexLib(knexConfig);

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
