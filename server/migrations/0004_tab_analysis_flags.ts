import type { Knex } from "knex";

// 14절: 탭당 10개 미만은 초안으로 저장 가능하되 완료 점유율 집계에 섞지 않는다.
// 12절: TOP10 검수와는 별개로 "전체 분류·지점 검수 확인" 단계를 명시적으로 거친 뒤 저장한다.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tab_analyses", (t) => {
    t.boolean("complete").notNullable().defaultTo(false);
    t.timestamp("classification_confirmed_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("tab_analyses", (t) => {
    t.dropColumn("complete");
    t.dropColumn("classification_confirmed_at");
  });
}
