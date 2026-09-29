import "dotenv/config";
import type { Knex } from "knex";

// Render 등 관리형 Postgres는 SSL 접속을 요구한다. DATABASE_SSL=true일 때만 켠다
// (로컬 개발 DB는 기본적으로 SSL이 없으므로 로컬 동작에는 영향 없음).
// rejectUnauthorized:false는 관리형 호스팅이 자체 서명 CA를 쓰는 경우가 많아 필요하다.
const useSsl = process.env.DATABASE_SSL === "true";

const config: Knex.Config = {
  client: "pg",
  connection: useSsl
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : process.env.DATABASE_URL,
  migrations: {
    directory: "./migrations",
    extension: "ts",
  },
  seeds: {
    directory: "./seeds",
  },
  pool: { min: 1, max: 10 },
};

export default config;
