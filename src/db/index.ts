import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __crmSql?: postgres.Sql; __crmDb?: Db };

export function getSql(): postgres.Sql {
  if (!globalForDb.__crmSql) {
    globalForDb.__crmSql = postgres(env.databaseUrl, { max: 10 });
  }
  return globalForDb.__crmSql;
}

export function getDb(): Db {
  if (!globalForDb.__crmDb) {
    globalForDb.__crmDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__crmDb;
}

export async function closeDb() {
  await globalForDb.__crmSql?.end({ timeout: 5 });
  globalForDb.__crmSql = undefined;
  globalForDb.__crmDb = undefined;
}

export { schema };
