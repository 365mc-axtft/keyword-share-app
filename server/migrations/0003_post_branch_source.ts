import type { Knex } from "knex";

// 13절: 채널 수정/지점 확정을 기존 분석에 소급 적용할 때, 사용자가 개별 게시물에서
// 직접 지정한 값은 덮어쓰지 않아야 한다. 자동(채널 매칭 기반)과 수동(사람이 직접 지정)을
// 구분하기 위한 출처 플래그.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("posts", (t) => {
    t.string("branch_source").notNullable().defaultTo("AUTO");
    t.string("content_type_source").notNullable().defaultTo("AUTO");
  });
  await knex.raw(`alter table posts add constraint posts_branch_source_chk check (branch_source in ('AUTO','MANUAL'))`);
  await knex.raw(
    `alter table posts add constraint posts_content_type_source_chk check (content_type_source in ('AUTO','MANUAL'))`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("posts", (t) => {
    t.dropColumn("branch_source");
    t.dropColumn("content_type_source");
  });
}
