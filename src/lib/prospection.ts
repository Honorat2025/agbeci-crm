/**
 * Prospection : opportunités (affaires en cours), rappels et envois groupés personnalisés.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, notInArray, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { OPPORTUNITY_KINDS, OPPORTUNITY_STAGES } from "@/db/schema";
import { personalHtml, personalText } from "./messages";
import { PRIORITY, remainingQuota, sentInLast24h } from "./queue";
import { env } from "./env";

const { opportunities, tasks, contacts, outbox, bulkSends } = schema;

export type Kind = (typeof OPPORTUNITY_KINDS)[number];
export type Stage = (typeof OPPORTUNITY_STAGES)[number];

export const KIND_LABELS: Record<Kind, string> = {
  client: "Client",
  consultation: "Consultation",
  prestation: "Prestation",
  emploi: "Emploi",
  autre: "Autre",
};

export const STAGE_LABELS: Record<Stage, string> = {
  piste: "Piste",
  contact: "Premier contact",
  proposition: "Proposition envoyée",
  negociation: "Négociation",
  gagnee: "Gagnée",
  perdue: "Perdue",
};

export const OPEN_STAGES: Stage[] = ["piste", "contact", "proposition", "negociation"];
export const OPPORTUNITY_STAGES_LIST: readonly Stage[] = OPPORTUNITY_STAGES;
export const CURRENCIES = ["EUR", "XOF", "XAF", "USD"] as const;

export const isKind = (v: unknown): v is Kind => OPPORTUNITY_KINDS.includes(v as Kind);
export const isStage = (v: unknown): v is Stage => OPPORTUNITY_STAGES.includes(v as Stage);

export function formatAmount(amount: number | null, currency: string): string {
  if (amount === null) return "";
  const n = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount);
  const symbol: Record<string, string> = { EUR: "€", USD: "$", XOF: "F CFA", XAF: "F CFA" };
  return `${n} ${symbol[currency] ?? currency}`;
}

/** Aujourd'hui en heure de Paris, au format AAAA-MM-JJ. */
export function todayParis(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/* ----------------------------- Opportunités ----------------------------- */

export type OpportunityInput = {
  title: string;
  kind: Kind;
  stage: Stage;
  contactId: number | null;
  organization: string | null;
  country: string | null;
  amount: number | null;
  currency: string;
  source: string | null;
  notes: string;
};

export async function listOpportunities(opts: { kind?: Kind; contactId?: number } = {}) {
  const filters: SQL[] = [];
  if (opts.kind) filters.push(eq(opportunities.kind, opts.kind));
  if (opts.contactId) filters.push(eq(opportunities.contactId, opts.contactId));
  return getDb()
    .select({
      o: opportunities,
      contactName: sql<string | null>`nullif(trim(coalesce(${contacts.firstName}, '') || ' ' || coalesce(${contacts.lastName}, '')), '')`,
      contactEmail: contacts.email,
      nextTask: sql<string | null>`(SELECT min(due_on) FROM tasks WHERE tasks.opportunity_id = ${opportunities.id} AND tasks.done_at IS NULL)`,
    })
    .from(opportunities)
    .leftJoin(contacts, eq(contacts.id, opportunities.contactId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(opportunities.updatedAt));
}

export async function getOpportunity(id: number) {
  const [o] = await getDb().select().from(opportunities).where(eq(opportunities.id, id));
  return o ?? null;
}

export async function createOpportunity(input: OpportunityInput) {
  const closed = input.stage === "gagnee" || input.stage === "perdue";
  const [row] = await getDb()
    .insert(opportunities)
    .values({ ...input, closedAt: closed ? new Date() : null })
    .returning({ id: opportunities.id });
  return row!.id;
}

export async function updateOpportunity(id: number, input: OpportunityInput) {
  const before = await getOpportunity(id);
  if (!before) return;
  const closed = input.stage === "gagnee" || input.stage === "perdue";
  await getDb()
    .update(opportunities)
    .set({
      ...input,
      closedAt: closed ? (before.closedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(opportunities.id, id));
}

export async function moveOpportunity(id: number, stage: Stage) {
  const closed = stage === "gagnee" || stage === "perdue";
  await getDb()
    .update(opportunities)
    .set({ stage, closedAt: closed ? new Date() : null, updatedAt: new Date() })
    .where(eq(opportunities.id, id));
}

export async function deleteOpportunity(id: number) {
  await getDb().delete(opportunities).where(eq(opportunities.id, id));
}

/** Nombre d'affaires et montant total par étape (en cours seulement), par devise. */
export async function pipelineSummary() {
  const rows = await getDb()
    .select({
      stage: opportunities.stage,
      currency: opportunities.currency,
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${opportunities.amount}), 0)::bigint`,
    })
    .from(opportunities)
    .where(inArray(opportunities.stage, OPEN_STAGES))
    .groupBy(opportunities.stage, opportunities.currency);
  return OPEN_STAGES.map((stage) => {
    const forStage = rows.filter((r) => r.stage === stage);
    return {
      stage,
      count: forStage.reduce((a, r) => a + Number(r.n), 0),
      totals: forStage.filter((r) => Number(r.total) > 0).map((r) => formatAmount(Number(r.total), r.currency)),
    };
  });
}

/* -------------------------------- Rappels -------------------------------- */

export async function addTask(input: { title: string; dueOn: string; contactId?: number | null; opportunityId?: number | null }) {
  let contactId = input.contactId ?? null;
  if (!contactId && input.opportunityId) {
    contactId = (await getOpportunity(input.opportunityId))?.contactId ?? null;
  }
  await getDb()
    .insert(tasks)
    .values({ title: input.title.trim().slice(0, 300), dueOn: input.dueOn, contactId, opportunityId: input.opportunityId ?? null });
}

export async function setTaskDone(id: number, done: boolean) {
  await getDb().update(tasks).set({ doneAt: done ? new Date() : null }).where(eq(tasks.id, id));
}

export async function postponeTask(id: number, days: number) {
  const [t] = await getDb().select().from(tasks).where(eq(tasks.id, id));
  if (!t) return;
  const base = t.dueOn < todayParis() ? todayParis() : t.dueOn;
  await getDb().update(tasks).set({ dueOn: addDays(base, days) }).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  await getDb().delete(tasks).where(eq(tasks.id, id));
}

const taskColumns = {
  t: tasks,
  contactName: sql<string | null>`nullif(trim(coalesce(${contacts.firstName}, '') || ' ' || coalesce(${contacts.lastName}, '')), '')`,
  contactEmail: contacts.email,
  opportunityTitle: opportunities.title,
};

/** Rappels non faits, du plus urgent au plus lointain. */
export async function openTasks(opts: { until?: string; contactId?: number; opportunityId?: number } = {}) {
  const filters: SQL[] = [isNull(tasks.doneAt)];
  if (opts.until) filters.push(lte(tasks.dueOn, opts.until));
  if (opts.contactId) filters.push(eq(tasks.contactId, opts.contactId));
  if (opts.opportunityId) filters.push(eq(tasks.opportunityId, opts.opportunityId));
  return getDb()
    .select(taskColumns)
    .from(tasks)
    .leftJoin(contacts, eq(contacts.id, tasks.contactId))
    .leftJoin(opportunities, eq(opportunities.id, tasks.opportunityId))
    .where(and(...filters))
    .orderBy(asc(tasks.dueOn), asc(tasks.id));
}

export async function recentlyDoneTasks(limit = 20) {
  return getDb()
    .select(taskColumns)
    .from(tasks)
    .leftJoin(contacts, eq(contacts.id, tasks.contactId))
    .leftJoin(opportunities, eq(opportunities.id, tasks.opportunityId))
    .where(isNotNull(tasks.doneAt))
    .orderBy(desc(tasks.doneAt))
    .limit(limit);
}

/* ----------------------- Envois groupés personnalisés ----------------------- */

/** Taille maximale d'un envoi groupé, pour ménager la réputation de l'adresse Gmail. */
export const BULK_MAX = 200;

/** Remplace {prenom}, {nom} et {organisation} ; nettoie les blancs laissés par une valeur manquante. */
export function personalize(template: string, c: { firstName: string | null; lastName: string | null; company: string | null }): string {
  return template
    .replace(/\{\s*pr[ée]nom\s*\}/gi, c.firstName ?? "")
    .replace(/\{\s*nom\s*\}/gi, c.lastName ?? "")
    .replace(/\{\s*organisation\s*\}/gi, c.company ?? "")
    .replace(/[ \t]+([,.;:!?])/g, (m, p: string) => (p === "," || p === "." ? p : ` ${p}`))
    .replace(/[ \t]{2,}/g, " ");
}

export const BULK_FOOTER = "Si vous préférez ne plus recevoir ce type de message, répondez simplement « stop ».";

/** Contacts qui recevront un envoi groupé pour cette étiquette. */
export async function bulkRecipients(tag: string) {
  return getDb()
    .select({ id: contacts.id, email: contacts.email, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company })
    .from(contacts)
    .where(
      and(
        sql`${tag} = ANY(${contacts.tags})`,
        isNotNull(contacts.email),
        eq(contacts.noBulk, false),
        notInArray(contacts.newsletterStatus, ["unsubscribed", "bounced"]),
      ),
    )
    .orderBy(asc(contacts.id));
}

export async function allTags(): Promise<{ tag: string; n: number }[]> {
  const rows = await getDb().execute<{ tag: string; n: number }>(
    sql`SELECT t AS tag, count(*)::int AS n FROM contacts, unnest(tags) t GROUP BY t ORDER BY count(*) DESC, t`,
  );
  return [...rows].map((r) => ({ tag: r.tag, n: Number(r.n) }));
}

/** Met un email personnalisé par contact dans la file d'envoi. */
export async function queueBulk(input: { tag: string; subject: string; body: string }) {
  const recipients = await bulkRecipients(input.tag);
  if (!recipients.length) throw new Error("Aucun contact avec cette étiquette.");
  if (recipients.length > BULK_MAX) throw new Error(`Trop de destinataires (${recipients.length}). Maximum ${BULK_MAX} par envoi.`);
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const c of recipients) {
      const body = `${personalize(input.body, c).trim()}\n\n${BULK_FOOTER}`;
      await tx.insert(outbox).values({
        kind: "personal",
        contactId: c.id,
        toEmail: c.email!,
        subject: personalize(input.subject, c).trim(),
        html: personalHtml(body),
        text: personalText(body),
        headers: {},
        // Après les réponses individuelles, pour ne jamais les retarder.
        priority: PRIORITY.personal - 10,
      });
    }
    await tx.insert(bulkSends).values({ ...input, recipients: recipients.length });
  });
  const quota = remainingQuota(await sentInLast24h(), env.dailySendLimit);
  return { count: recipients.length, quota };
}

export async function recentBulkSends(limit = 10) {
  return getDb().select().from(bulkSends).orderBy(desc(bulkSends.createdAt)).limit(limit);
}

export async function setNoBulk(contactId: number, value: boolean) {
  await getDb().update(contacts).set({ noBulk: value, updatedAt: new Date() }).where(eq(contacts.id, contactId));
}
