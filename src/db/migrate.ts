import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb, closeDb } from "./index";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Base de données à jour.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
