import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, getSql, schema } from "@/db";
import { env } from "./env";
import { escapeHtml, listUnsubscribeHeaders, newsletterEmail } from "./email-templates";
import { PRIORITY } from "./queue";

const { newsletters, outbox, contacts } = schema;

export async function listNewsletters() {
  return getDb().select().from(newsletters).orderBy(desc(newsletters.createdAt));
}

export async function getNewsletter(id: number) {
  const [n] = await getDb().select().from(newsletters).where(eq(newsletters.id, id));
  return n ?? null;
}

export async function createNewsletter(data: {
  subject: string;
  preheader: string | null;
  bodyMarkdown: string;
  origin?: string;
  originUrl?: string | null;
}) {
  const [n] = await getDb()
    .insert(newsletters)
    .values({ ...data, origin: data.origin ?? "manual", originUrl: data.originUrl ?? null })
    .returning();
  return n!;
}

export async function updateNewsletter(
  id: number,
  data: { subject: string; preheader: string | null; bodyMarkdown: string },
) {
  const [n] = await getDb()
    .update(newsletters)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(newsletters.id, id), eq(newsletters.status, "draft")))
    .returning();
  return n ?? null;
}

export async function deleteDraft(id: number) {
  await getDb().delete(newsletters).where(and(eq(newsletters.id, id), eq(newsletters.status, "draft")));
}

/** Brouillon créé automatiquement quand un article est publié sur WordPress. */
export async function draftFromWordPressPost(post: { title: string; url: string; excerpt?: string }) {
  const db = getDb();
  const [existing] = await db.select().from(newsletters).where(eq(newsletters.originUrl, post.url));
  if (existing) return existing;
  const intro = post.excerpt ? `${post.excerpt}\n\n` : "";
  return createNewsletter({
    subject: post.title,
    preheader: "Nouvel article sur le blog",
    bodyMarkdown: `Bonjour,\n\nJe viens de publier un nouvel article : **${post.title}**\n\n${intro}[Lire l'article](${post.url})\n\nBonne lecture,\n\n${env.mailFromName}`,
    origin: "wordpress",
    originUrl: post.url,
  });
}

/** Envoie la newsletter à une seule adresse, pour vérifier le rendu. */
export async function queueTestSend(id: number, to: string) {
  const n = await getNewsletter(id);
  if (!n) throw new Error("Newsletter introuvable");
  const mail = newsletterEmail(n, "test");
  await getDb()
    .insert(outbox)
    .values({
      kind: "test",
      toEmail: to,
      subject: `[Test] ${mail.subject}`,
      html: mail.html,
      text: mail.text,
      priority: PRIORITY.test,
    });
}

/**
 * Met la newsletter en file pour tous les abonnés confirmés. Chaque email est
 * personnalisé (lien de désinscription propre à chacun). L'index unique
 * (newsletter, contact) empêche tout doublon si on clique deux fois.
 */
export async function queueNewsletter(id: number): Promise<number> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [n] = await tx
      .update(newsletters)
      .set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(newsletters.id, id), eq(newsletters.status, "draft")))
      .returning();
    if (!n) throw new Error("Cette newsletter a déjà été envoyée ou n'existe pas.");

    const subscribers = await tx
      .select({ id: contacts.id, email: contacts.email, token: contacts.unsubscribeToken })
      .from(contacts)
      .where(eq(contacts.newsletterStatus, "subscribed"));

    for (const s of subscribers) {
      if (!s.email) continue;
      const mail = newsletterEmail(n, s.token);
      await tx
        .insert(outbox)
        .values({
          kind: "newsletter",
          contactId: s.id,
          newsletterId: n.id,
          toEmail: s.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: listUnsubscribeHeaders(s.token),
          priority: PRIORITY.newsletter,
        })
        .onConflictDoNothing();
    }

    await tx.update(newsletters).set({ recipientsCount: subscribers.length }).where(eq(newsletters.id, n.id));
    if (subscribers.length === 0) {
      await tx.update(newsletters).set({ status: "sent", sentAt: new Date() }).where(eq(newsletters.id, n.id));
    }
    return subscribers.length;
  });
}

/** Passe en « envoyée » les newsletters dont plus aucun email n'attend. */
export async function markFinishedNewsletters() {
  await getSql()`
    UPDATE newsletters n SET status = 'sent', sent_at = now()
    WHERE n.status = 'sending'
      AND NOT EXISTS (
        SELECT 1 FROM outbox o
        WHERE o.newsletter_id = n.id AND o.status IN ('pending', 'sending')
      )`;
}

export async function newsletterProgress(ids: number[]) {
  if (ids.length === 0) return new Map<number, Record<string, number>>();
  const rows = await getDb()
    .select({ id: outbox.newsletterId, status: outbox.status, n: sql<number>`count(*)::int` })
    .from(outbox)
    .where(inArray(outbox.newsletterId, ids))
    .groupBy(outbox.newsletterId, outbox.status);
  const map = new Map<number, Record<string, number>>();
  for (const r of rows) {
    if (r.id == null) continue;
    const m = map.get(r.id) ?? {};
    m[r.status] = r.n;
    map.set(r.id, m);
  }
  return map;
}

export function previewHtml(n: { subject: string; preheader: string | null; bodyMarkdown: string }) {
  return newsletterEmail(n, "apercu").html;
}

export { escapeHtml };
