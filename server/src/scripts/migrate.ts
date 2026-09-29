import knexLib from "knex";
import config from "../knexfile";

async function main() {
  const direction = process.argv[2] ?? "latest";
  const db = knexLib(config);
  try {
    if (direction === "latest") {
      const [batch, list] = await db.migrate.latest();
      console.log(`Batch ${batch} run: ${list.length} migrations`, list);
    } else if (direction === "rollback") {
      const [batch, list] = await db.migrate.rollback();
      console.log(`Batch ${batch} rolled back: ${list.length} migrations`, list);
    } else if (direction === "status") {
      const [completed, pending] = await Promise.all([
        db.migrate.list(),
        Promise.resolve(null),
      ]);
      console.log(completed);
    } else {
      console.error("Usage: tsx src/scripts/migrate.ts [latest|rollback|status]");
      process.exit(1);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
