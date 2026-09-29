import type { Knex } from "knex";

// 365mc 검색 점유율 분석 — 초기 스키마
// 명세서 16절 "데이터 모델 최소 구성"을 그대로 테이블로 구현한다.
// enum류는 varchar + CHECK 제약으로 구현해 PostgreSQL 외 DB로도 이식이 쉽게 한다.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("companies", (t) => {
    t.string("id").primary();
    t.string("name").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("users", (t) => {
    t.string("id").primary();
    t.string("company_id").notNullable().references("id").inTable("companies");
    t.string("email").notNullable().unique();
    t.string("password_hash").notNullable();
    t.string("name").notNullable();
    t.string("global_role").notNullable().defaultTo("MEMBER");
    t.check("?? in ('ADMIN','MEMBER')", ["global_role"]);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("brands", (t) => {
    t.string("id").primary();
    t.string("company_id").notNullable().references("id").inTable("companies");
    t.string("name").notNullable();
    t.unique(["company_id", "name"]);
  });

  await knex.schema.createTable("branches", (t) => {
    t.string("id").primary();
    t.string("company_id").notNullable().references("id").inTable("companies");
    t.string("name").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.unique(["company_id", "name"]);
  });

  await knex.schema.createTable("competitors", (t) => {
    t.string("id").primary();
    t.string("company_id").notNullable().references("id").inTable("companies");
    t.string("name").notNullable();
    t.unique(["company_id", "name"]);
  });

  await knex.schema.createTable("teams", (t) => {
    t.string("id").primary();
    t.string("company_id").notNullable().references("id").inTable("companies");
    t.string("name").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("deleted_at").nullable();
    t.string("default_keyword_group_id").nullable();
    t.string("default_search_env").nullable();
    t.check("?? is null or ?? in ('MOBILE','PC')", ["default_search_env", "default_search_env"]);
    t.string("default_search_tab").nullable();
    t.check("?? is null or ?? in ('BLOG','INTEGRATED','BOTH')", ["default_search_tab", "default_search_tab"]);
    t.unique(["company_id", "name"]);
  });

  await knex.schema.createTable("team_memberships", (t) => {
    t.string("id").primary();
    t.string("user_id").notNullable().references("id").inTable("users");
    t.string("team_id").notNullable().references("id").inTable("teams");
    t.string("role").notNullable().defaultTo("MEMBER");
    t.check("?? in ('TEAM_ADMIN','MEMBER')", ["role"]);
    t.timestamp("joined_at").notNullable().defaultTo(knex.fn.now());
    t.unique(["user_id", "team_id"]);
  });

  await knex.schema.createTable("keyword_groups", (t) => {
    t.string("id").primary();
    t.string("team_id").notNullable().references("id").inTable("teams");
    t.string("name").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.unique(["team_id", "name"]);
  });

  await knex.schema.createTable("keywords", (t) => {
    t.string("id").primary();
    t.string("team_id").notNullable().references("id").inTable("teams");
    t.string("keyword_group_id").nullable().references("id").inTable("keyword_groups");
    t.string("text").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.unique(["team_id", "text"]);
  });

  await knex.schema.createTable("search_volume_entries", (t) => {
    t.string("id").primary();
    t.string("team_id").notNullable().references("id").inTable("teams");
    t.string("keyword_id").notNullable().references("id").inTable("keywords");
    t.string("year_month").notNullable(); // "2026-09"
    t.integer("volume").notNullable();
    t.string("source").notNullable().defaultTo("MANUAL");
    t.check("?? in ('MANUAL','EXCEL')", ["source"]);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.unique(["team_id", "keyword_id", "year_month"]);
  });

  await knex.schema.createTable("channels", (t) => {
    t.string("id").primary();
    t.string("company_id").notNullable().references("id").inTable("companies");
    t.string("platform").notNullable();
    t.check(
      "?? in ('NAVER_BLOG','NAVER_CAFE','DAUM_CAFE','TISTORY','KIN','OWN_HOMEPAGE','APP','OTHER')",
      ["platform"]
    );
    t.string("exposed_name").notNullable();
    t.string("internal_nickname").nullable();
    t.string("channel_id_or_url").nullable();
    t.string("normalized_key").notNullable();
    t.string("segment").notNullable().defaultTo("UNCLASSIFIED");
    t.check(
      "?? in ('OWN_365MC','SUPPORTER_CUSTOMER','COMPETITOR','GENERAL_INFO','UNCLASSIFIED')",
      ["segment"]
    );
    t.string("brand_id").nullable().references("id").inTable("brands");
    t.string("branch_id").nullable().references("id").inTable("branches");
    t.string("competitor_id").nullable().references("id").inTable("competitors");
    t.text("note").nullable();
    t.boolean("active").notNullable().defaultTo(true);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.string("created_by").nullable();
    t.string("updated_by").nullable();
    t.unique(["company_id", "platform", "normalized_key"]);
    t.index(["company_id", "exposed_name"]);
  });

  await knex.schema.createTable("channel_aliases", (t) => {
    t.string("id").primary();
    t.string("channel_id").notNullable().references("id").inTable("channels");
    t.string("alias").notNullable();
    t.unique(["channel_id", "alias"]);
  });

  await knex.schema.createTable("investigations", (t) => {
    t.string("id").primary();
    t.string("team_id").notNullable().references("id").inTable("teams");
    t.string("keyword_id").nullable().references("id").inTable("keywords");
    t.string("keyword_text").notNullable();
    t.string("keyword_group_id").nullable().references("id").inTable("keyword_groups");
    t.date("investigation_date").notNullable();
    t.string("search_environment").notNullable();
    t.check("?? in ('MOBILE','PC')", ["search_environment"]);
    t.string("tabs_requested").notNullable();
    t.check("?? in ('BLOG','INTEGRATED','BOTH')", ["tabs_requested"]);
    t.string("created_by_id").notNullable().references("id").inTable("users");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("saved_at").nullable();
    t.index(["team_id", "investigation_date"]);
  });

  await knex.schema.createTable("tab_analyses", (t) => {
    t.string("id").primary();
    t.string("investigation_id").notNullable().references("id").inTable("investigations");
    t.string("tab_type").notNullable();
    t.check("?? in ('BLOG','INTEGRATED')", ["tab_type"]);
    t.string("status").notNullable().defaultTo("DRAFT");
    t.check(
      "?? in ('DRAFT','UPLOADING','OCR_PROCESSING','NEEDS_REVIEW','CLASSIFYING','SAVED','FAILED')",
      ["status"]
    );
    t.text("module_filter_json").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("reviewed_at").nullable();
    t.timestamp("saved_at").nullable();
    t.unique(["investigation_id", "tab_type"]);
  });

  await knex.schema.createTable("uploaded_images", (t) => {
    t.string("id").primary();
    t.string("tab_analysis_id").notNullable().references("id").inTable("tab_analyses");
    t.string("original_name").notNullable();
    t.string("storage_path").notNullable();
    t.string("mime_type").notNullable();
    t.integer("file_size_bytes").notNullable();
    t.integer("width_px").notNullable();
    t.integer("height_px").notNullable();
    t.integer("sequence_index").notNullable();
    t.integer("overlap_px_with_prev").nullable();
    t.string("ocr_status").notNullable().defaultTo("PENDING");
    t.check("?? in ('PENDING','PROCESSING','DONE','FAILED')", ["ocr_status"]);
    t.text("ocr_error").nullable();
    t.timestamp("ocr_started_at").nullable();
    t.timestamp("ocr_finished_at").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("detected_modules", (t) => {
    t.string("id").primary();
    t.string("tab_analysis_id").notNullable().references("id").inTable("tab_analyses");
    t.string("uploaded_image_id").nullable().references("id").inTable("uploaded_images");
    t.string("kind").notNullable();
    t.check("?? in ('MODULE','GENERAL_SOURCE')", ["kind"]);
    t.string("name").notNullable();
    t.boolean("is_post_bearing").notNullable().defaultTo(true);
    t.boolean("included_by_default").notNullable().defaultTo(true);
    t.integer("detected_post_count").notNullable().defaultTo(0);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["tab_analysis_id"]);
  });

  await knex.schema.createTable("posts", (t) => {
    t.string("id").primary();
    t.string("tab_analysis_id").notNullable().references("id").inTable("tab_analyses");
    t.string("uploaded_image_id").nullable().references("id").inTable("uploaded_images");
    t.string("group_id").nullable().references("id").inTable("detected_modules");

    t.integer("original_order").notNullable();
    t.integer("analysis_rank").nullable();
    t.boolean("included_in_top10").notNullable().defaultTo(false);
    t.boolean("is_deleted_misrecognition").notNullable().defaultTo(false);
    t.boolean("is_manually_added").notNullable().defaultTo(false);

    t.string("channel_type_guess").notNullable().defaultTo("UNCLASSIFIED");
    t.check(
      "?? in ('OWN_HOMEPAGE','OWN_BLOG','CAFE','KIN','TISTORY','APP','BLOG','OTHER','UNCLASSIFIED')",
      ["channel_type_guess"]
    );
    t.string("exposed_channel_name").notNullable().defaultTo("");
    t.text("title_text").notNullable().defaultTo("");

    t.text("ocr_raw_channel_name").nullable();
    t.text("ocr_raw_title").nullable();
    t.float("ocr_confidence_channel").nullable();
    t.float("ocr_confidence_title").nullable();

    t.string("matched_channel_id").nullable().references("id").inTable("channels");
    t.string("match_method").notNullable().defaultTo("NONE");
    t.check("?? in ('URL_ID','PLATFORM_NAME','ALIAS','FUZZY','MANUAL','NONE')", ["match_method"]);
    t.float("match_confidence").nullable();

    t.string("content_type").nullable();
    t.check("?? is null or ?? in ('BRANDED','REVIEW','INFORMATIONAL','COMPETITOR')", [
      "content_type",
      "content_type",
    ]);
    t.boolean("related_365mc").nullable();
    t.string("branch_id").nullable().references("id").inTable("branches");
    t.string("branch_status").notNullable().defaultTo("NOT_APPLICABLE");
    t.check("?? in ('CONFIRMED','PENDING','NOT_APPLICABLE')", ["branch_status"]);

    t.text("source_bounds_json").nullable();

    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.string("last_edited_by_id").nullable();

    t.index(["tab_analysis_id", "original_order"]);
    t.index(["tab_analysis_id", "analysis_rank"]);
  });

  await knex.schema.createTable("monthly_reports", (t) => {
    t.string("id").primary();
    t.string("team_id").notNullable().references("id").inTable("teams");
    t.string("year_month").notNullable();
    t.text("criteria_json").notNullable();
    t.text("branch_notes_json").nullable();
    t.string("review_status").notNullable().defaultTo("DRAFT");
    t.check("?? in ('DRAFT','IN_REVIEW','FINAL')", ["review_status"]);
    t.string("created_by_id").notNullable().references("id").inTable("users");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("finalized_at").nullable();
    t.unique(["team_id", "year_month"]);
  });

  await knex.schema.createTable("report_comments", (t) => {
    t.string("id").primary();
    t.string("report_id").notNullable().references("id").inTable("monthly_reports");
    t.string("user_id").notNullable().references("id").inTable("users");
    t.text("body").notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("audit_logs", (t) => {
    t.string("id").primary();
    t.string("entity_type").notNullable();
    t.string("entity_id").notNullable();
    t.string("field").notNullable();
    t.text("old_value").nullable();
    t.text("new_value").nullable();
    t.string("user_id").nullable().references("id").inTable("users");
    t.string("team_id").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["entity_type", "entity_id"]);
  });

  await knex.schema.createTable("usage_logs", (t) => {
    t.string("id").primary();
    t.string("type").notNullable();
    t.string("team_id").nullable();
    t.string("user_id").nullable();
    t.text("meta_json").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("usage_logs");
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.dropTableIfExists("report_comments");
  await knex.schema.dropTableIfExists("monthly_reports");
  await knex.schema.dropTableIfExists("posts");
  await knex.schema.dropTableIfExists("detected_modules");
  await knex.schema.dropTableIfExists("uploaded_images");
  await knex.schema.dropTableIfExists("tab_analyses");
  await knex.schema.dropTableIfExists("investigations");
  await knex.schema.dropTableIfExists("channel_aliases");
  await knex.schema.dropTableIfExists("channels");
  await knex.schema.dropTableIfExists("search_volume_entries");
  await knex.schema.dropTableIfExists("keywords");
  await knex.schema.dropTableIfExists("keyword_groups");
  await knex.schema.dropTableIfExists("team_memberships");
  await knex.schema.dropTableIfExists("teams");
  await knex.schema.dropTableIfExists("competitors");
  await knex.schema.dropTableIfExists("branches");
  await knex.schema.dropTableIfExists("brands");
  await knex.schema.dropTableIfExists("users");
  await knex.schema.dropTableIfExists("companies");
}
