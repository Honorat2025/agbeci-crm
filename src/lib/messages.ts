/**
 * Messagerie : lecture des conversations recopiées depuis Gmail, et envoi
 * de réponses ou de nouveaux messages (toujours par la file d'envoi).
 */
import { asc, eq, sql } from "drizzle-orm";
import { getDb, getSql, schema } from "@/db";
import { escapeHtml } from "./email-templates";
import { PRIORITY } from "./queue";
import { getMailSettings } from "./settings";

const { mailMessages, outbox, contacts } = schema;

export type Folder = "nonlus" | "reception" | "envoyes" | "tous";

export type ThreadSummary = {
  threadId: string;
  subject: string;
  snippet: string;
  lastDate: Date;
  count: number;
  unseen: number;
  /** Nom ou adresse des correspondants (hors Honorat). */
  people: string[];
  outgoingLast: boolean;
};

const PAGE_SIZE = 50;

/** Liste des conversations, la plus récente en premier. */
export async function listThreads(opts: { folder?: Folder; q?: string; page?: number; participant?: string } = {}) {
  const folder = opts.folder ?? "reception";
  const page = Math.max(1, opts.page ?? 1);
  const sqlc = getSql();
  const own = (await getMailSettings()).address.toLowerCase();
  const q = opts.q?.trim() ? `%${opts.q.trim().replace(/[%_\\]/g, "")}%` : null;
  const participant = opts.participant?.toLowerCase() ?? null;

  // Une conversation apparaît dans un dossier dès qu'un de ses messages y est.
  const rows = await sqlc<
    {
      thread_id: string;
      subject: string;
      snippet: string;
      last_date: Date;
      count: string;
      unseen: string;
      people: { name: string | null; address: string }[] | null;
      outgoing_last: boolean;
    }[]
  >`
    WITH matching AS (
      SELECT DISTINCT thread_id FROM mail_messages m
      WHERE (${folder} = 'tous'
          OR (${folder} = 'reception' AND '\\Inbox' = ANY(m.labels))
          OR (${folder} = 'envoyes' AND m.outgoing)
          OR (${folder} = 'nonlus' AND NOT m.seen AND '\\Inbox' = ANY(m.labels)))
        AND (${q}::text IS NULL OR m.subject ILIKE ${q} OR m.from_email ILIKE ${q} OR m.from_name ILIKE ${q} OR m.text_body ILIKE ${q})
        AND (${participant}::text IS NULL OR ${participant} = ANY(m.participants))
    ),
    agg AS (
      SELECT m.thread_id,
             max(m.date) AS last_date,
             count(*) AS count,
             count(*) FILTER (WHERE NOT m.seen) AS unseen
      FROM mail_messages m JOIN matching USING (thread_id)
      GROUP BY m.thread_id
      ORDER BY last_date DESC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}
    )
    SELECT a.thread_id, a.last_date, a.count, a.unseen,
           first.subject,
           last.snippet,
           last.outgoing AS outgoing_last,
           (SELECT json_agg(DISTINCT jsonb_build_object('name', p.from_name, 'address', p.from_email))
              FROM mail_messages p WHERE p.thread_id = a.thread_id AND p.from_email <> ${own}) AS people
    FROM agg a
    CROSS JOIN LATERAL (SELECT subject FROM mail_messages WHERE thread_id = a.thread_id ORDER BY date ASC LIMIT 1) first
    CROSS JOIN LATERAL (SELECT snippet, outgoing FROM mail_messages WHERE thread_id = a.thread_id ORDER BY date DESC LIMIT 1) last
    ORDER BY a.last_date DESC`;

  const threads: ThreadSummary[] = rows.slice(0, PAGE_SIZE).map((r) => ({
    threadId: r.thread_id,
    subject: r.subject || "(sans objet)",
    snippet: r.snippet,
    lastDate: new Date(r.last_date),
    count: Number(r.count),
    unseen: Number(r.unseen),
    people: (r.people ?? []).map((p) => p.name || p.address).slice(0, 3),
    outgoingLast: r.outgoing_last,
  }));
  return { threads, hasMore: rows.length > PAGE_SIZE, page };
}

export async function getThread(threadId: string) {
  return getDb().select().from(mailMessages).where(eq(mailMessages.threadId, threadId)).orderBy(asc(mailMessages.date));
}

export async function unseenInboxCount(): Promise<number> {
  const [row] = await getSql()<{ n: string }[]>`
    SELECT count(DISTINCT thread_id) AS n FROM mail_messages WHERE NOT seen AND '\\Inbox' = ANY(labels)`;
  return Number(row?.n ?? 0);
}

/** Rend cliquables les adresses web d'un texte déjà échappé. */
export function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (raw) => {
    const url = raw.replace(/[.,;:!?)]+$/, "");
    const rest = raw.slice(url.length);
    return `<a href="${url}">${url}</a>${rest}`;
  });
}

/** Corps d'un email personnel : texte simple, converti en HTML lisible. */
export function personalHtml(body: string, quoted?: { date: Date; from: string; text: string }): string {
  const paragraphs = escapeHtml(body.trim())
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 1em">${linkify(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  const quote = quoted
    ? `<div style="margin-top:1.5em;color:#555">Le ${escapeHtml(formatDate(quoted.date))}, ${escapeHtml(quoted.from)} a écrit :</div>
<blockquote style="margin:0.5em 0 0;padding-left:1em;border-left:3px solid #ccc;color:#555">${escapeHtml(quoted.text.trim().slice(0, 20_000)).replace(/\n/g, "<br>")}</blockquote>`
    : "";
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f1f1f">${paragraphs}${quote}</div>`;
}

export function personalText(body: string, quoted?: { date: Date; from: string; text: string }): string {
  if (!quoted) return body.trim();
  const q = quoted.text
    .trim()
    .slice(0, 20_000)
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `${body.trim()}\n\nLe ${formatDate(quoted.date)}, ${quoted.from} a écrit :\n${q}`;
}

export function formatDate(d: Date): string {
  return d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });
}

/** Date courte pour les listes : l'heure si c'est aujourd'hui, sinon le jour. */
export function shortDate(d: Date): string {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    : d.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
        timeZone: "Europe/Paris",
      });
}

export function replySubject(subject: string): string {
  return /^(re|ré|aw|tr)\s*:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

/** Adresse la plus probable pour répondre : l'expéditeur du dernier message reçu. */
export function replyTarget(thread: { outgoing: boolean; fromEmail: string; to: { address: string }[] }[], own: string) {
  const lastIncoming = [...thread].reverse().find((m) => !m.outgoing);
  if (lastIncoming) return lastIncoming.fromEmail;
  const last = thread.at(-1);
  return last?.to.find((a) => a.address !== own.toLowerCase())?.address ?? "";
}

async function contactIdFor(email: string): Promise<number | null> {
  const [c] = await getDb().select({ id: contacts.id }).from(contacts).where(eq(contacts.email, email.toLowerCase()));
  return c?.id ?? null;
}

/** Met une réponse dans la file d'envoi. Gmail la rangera dans la même conversation. */
export async function queueReply(input: { threadId: string; to: string; cc?: string | null; body: string }) {
  const thread = await getThread(input.threadId);
  const last = thread.at(-1);
  if (!last) throw new Error("Conversation introuvable.");
  const first = thread[0]!;
  const refs = [last.references, last.messageIdHeader].filter(Boolean).join(" ").trim();
  const headers: Record<string, string> = {};
  if (last.messageIdHeader) headers["In-Reply-To"] = last.messageIdHeader;
  if (refs) headers["References"] = refs;
  const quoted = { date: last.date, from: last.fromName || last.fromEmail, text: last.textBody };
  const [row] = await getDb()
    .insert(outbox)
    .values({
      kind: "personal",
      contactId: await contactIdFor(input.to),
      toEmail: input.to,
      cc: input.cc || null,
      subject: replySubject(first.subject),
      html: personalHtml(input.body, quoted),
      text: personalText(input.body, quoted),
      headers,
      priority: PRIORITY.personal,
    })
    .returning({ id: outbox.id });
  return row!.id;
}

/** Nouveau message à une personne. */
export async function queueNewMessage(input: { to: string; cc?: string | null; subject: string; body: string }) {
  const [row] = await getDb()
    .insert(outbox)
    .values({
      kind: "personal",
      contactId: await contactIdFor(input.to),
      toEmail: input.to,
      cc: input.cc || null,
      subject: input.subject.trim(),
      html: personalHtml(input.body),
      text: personalText(input.body),
      headers: {},
      priority: PRIORITY.personal,
    })
    .returning({ id: outbox.id });
  return row!.id;
}

/** Emails personnels encore dans la file (pour afficher « en cours d'envoi »). */
export async function pendingPersonal() {
  return getDb()
    .select({ id: outbox.id, toEmail: outbox.toEmail, subject: outbox.subject, status: outbox.status, lastError: outbox.lastError, createdAt: outbox.createdAt })
    .from(outbox)
    .where(sql`${outbox.kind} = 'personal' AND ${outbox.status} IN ('pending', 'sending', 'failed') AND ${outbox.createdAt} > now() - interval '7 days'`)
    .orderBy(asc(outbox.createdAt));
}
