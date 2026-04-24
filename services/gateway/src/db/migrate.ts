import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closeSql, getSql } from "./pool.js";

async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const schemaPath = join(here, "schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  const sql = getSql();
  console.log(`Running schema.sql (${schema.length} chars)...`);
  await sql.unsafe(schema);
  console.log("Migration complete.");
  await closeSql();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
