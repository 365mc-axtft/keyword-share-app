import type { Knex } from "knex";

// 소프트 삭제된 팀은 같은 이름을 다시 쓸 수 있어야 하므로(4절: 팀 이름 중복 방지는
// "같은 회사"의 "활성" 팀 기준), 전체 유니크 대신 deleted_at IS NULL 부분 유니크 인덱스로 교체한다.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("teams", (t) => {
    t.dropUnique(["company_id", "name"]);
  });
  await knex.raw(
    `create unique index teams_company_name_active_uidx on teams (company_id, name) where deleted_at is null`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`drop index if exists teams_company_name_active_uidx`);
  await knex.schema.alterTable("teams", (t) => {
    t.unique(["company_id", "name"]);
  });
}
