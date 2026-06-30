import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  ssl: process.env.REVIVE_DATABASE_SSL === "disable" ? false : "require",
});
try {
  const directory = path.join(process.cwd(), "db", "migrations");
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await sql.unsafe(await fs.readFile(path.join(directory, file), "utf8"));
    console.log(`applied ${file}`);
  }
} finally {
  await sql.end();
}
