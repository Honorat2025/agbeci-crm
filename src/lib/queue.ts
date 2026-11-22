import { and, eq, gte, sql, count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";
import type { Mailer } from "./mailer";

const { outbox } = schema;

export const PRIORITY = { confirm: 100, welcome: 90, test: 80, newsletter: 0 } as const;
const MAX_ATTEMPTS = 5;

/** Combien d'emails peuvent encore partir, compte tenu des envois des dernières 24 h. */
export function remainingQuota(sentLast24h: number, dailyLimit: number): number {
  return Math.max(0, dailyLimit - sentLast24h);
}

/** Délai avant un nouvel essai après une erreur : 1 min, 5 min, 25 min, 2 h... */
export function retryDelayMs(attempts: number): number {
  return Math.min(60_000 * 5 ** Math.max(0, attempts - 1), 6 * 3600_000);
}

export async function sentInLast24h(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(outbox)
    .where(and(eq(outbox.status, "sent"), gte(outbox.sentAt, sql`now() - interval '24 hours'`)));
  return Number(row?.n ?? 0);
}

/**
 * Réserve le prochain email à envoyer. FOR UPDATE SKIP LOCKED évite qu'un même
 * email parte deux fois si deux workers tournent par erreur.
 */
async function claimNext() {
  const sqlc = (await import("@/db")).getSql();
  const rows = await sqlc<{ id: number }[]>`
    UPDATE outbox SET status = 'sending', attempts = attempts + 1
    WHERE id = (
      SELECT id FROM outbox
      WHERE status = 'pending' AND not_before <= now()
      ORDER BY priority DESC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`;
  if (!rows[0]) return null;
  const db = getDb();
  const [row] = await db.select().from(outbox).where(eq(outbox.id, rows[0].id));
  return row ?? null;
}

/**
 * Envoie au plus `max` emails en respectant le quota quotidien.
 * Retourne le nombre d'emails effectivement envoyés.
 */
export async function processOutbox(
  mailer: Mailer,
  opts: { max?: number; intervalMs?: number; dailyLimit?: number } = {},
): Promise<number> {
  const db = getDb();
  const dailyLimit = opts.dailyLimit ?? env.dailySendLimit;
  const intervalMs = opts.intervalMs ?? 0;
  let quota = remainingQuota(await sentInLast24h(), dailyLimit);
  const max = Math.min(opts.max ?? 50, quota);
  let sent = 0;

  while (sent < max) {
    const row = await claimNext();
    if (!row) break;
    try {
      await mailer.send({
        to: row.toEmail,
        subject: row.subject,
        html: row.html,
        text: row.text,
        headers: row.headers,
      });
      await db.update(outbox).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(outbox.id, row.id));
      sent += 1;
      quota -= 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = row.attempts >= MAX_ATTEMPTS;
      await db
        .update(outbox)
        .set({
          status: failed ? "failed" : "pending",
          lastError: message.slice(0, 1000),
          notBefore: new Date(Date.now() + retryDelayMs(row.attempts)),
        })
        .where(eq(outbox.id, row.id));
      console.error(`Échec d'envoi à ${row.toEmail} (essai ${row.attempts}) : ${message}`);
    }
    if (intervalMs > 0 && sent < max) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return sent;
}

/**
 * Au démarrage du worker (il n'y en a qu'un), remet en file les emails restés
 * « en cours » après un arrêt brutal.
 */
export async function recoverStuck() {
  const db = getDb();
  await db.update(outbox).set({ status: "pending" }).where(eq(outbox.status, "sending"));
}

export async function outboxStats() {
  const db = getDb();
  const rows = await db.select({ status: outbox.status, n: count() }).from(outbox).groupBy(outbox.status);
  const stats = { pending: 0, sending: 0, sent: 0, failed: 0 };
  for (const r of rows) stats[r.status] = Number(r.n);
  return stats;
}
