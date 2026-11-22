import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";
import { confirmEmail, listUnsubscribeHeaders, welcomeEmail } from "./email-templates";
import { PRIORITY } from "./queue";


const { contacts, outbox } = schema;
const CONFIRM_VALIDITY_MS = 7 * 24 * 3600_000;

export type SubscribeResult = "confirmation_sent" | "already_subscribed";

/**
 * Inscription depuis le site. Double confirmation : le contact reste « en attente »
 * tant qu'il n'a pas cliqué sur le lien reçu par email.
 * La réponse est la même que l'adresse existe ou non, pour ne rien révéler.
 */
export async function subscribe(
  input: { email: string; firstName?: string },
  meta: { ip: string; source: string },
): Promise<SubscribeResult> {
  const db = getDb();
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + CONFIRM_VALIDITY_MS);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(contacts).where(eq(contacts.email, input.email));

    if (existing?.newsletterStatus === "subscribed") return "already_subscribed";

    let contactId: number;
    if (existing) {
      await tx
        .update(contacts)
        .set({
          firstName: existing.firstName ?? input.firstName ?? null,
          newsletterStatus: "pending",
          consentAt: now,
          consentSource: meta.source,
          consentIp: meta.ip,
          confirmTokenHash: sha256(token),
          confirmTokenExpiresAt: expires,
          updatedAt: now,
        })
        .where(eq(contacts.id, existing.id));
      contactId = existing.id;
    } else {
      const [created] = await tx
        .insert(contacts)
        .values({
          email: input.email,
          firstName: input.firstName ?? null,
          source: "newsletter",
          newsletterStatus: "pending",
          consentAt: now,
          consentSource: meta.source,
          consentIp: meta.ip,
          confirmTokenHash: sha256(token),
          confirmTokenExpiresAt: expires,
          unsubscribeToken: randomToken(),
        })
        .returning({ id: contacts.id });
      contactId = created!.id;
    }

    const mail = confirmEmail(existing?.firstName ?? input.firstName, `${env.appUrl}/confirmer?t=${token}`);
    await tx.insert(outbox).values({
      kind: "confirm",
      contactId,
      toEmail: input.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      priority: PRIORITY.confirm,
    });
    return "confirmation_sent";
  });
}

/** Valide le lien de confirmation. Retourne false si le lien est inconnu ou expiré. */
export async function confirmSubscription(token: string): Promise<boolean> {
  if (!token) return false;
  const db = getDb();
  const now = new Date();
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.confirmTokenHash, sha256(token)), gt(contacts.confirmTokenExpiresAt, now)));
    if (!contact) return false;

    await tx
      .update(contacts)
      .set({
        newsletterStatus: "subscribed",
        confirmedAt: now,
        unsubscribedAt: null,
        confirmTokenHash: null,
        confirmTokenExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(contacts.id, contact.id));

    const mail = welcomeEmail(contact.firstName, contact.unsubscribeToken);
    await tx.insert(outbox).values({
      kind: "welcome",
      contactId: contact.id,
      toEmail: contact.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: listUnsubscribeHeaders(contact.unsubscribeToken),
      priority: PRIORITY.welcome,
    });
    return true;
  });
}

/** Désinscription en un clic. Annule aussi les newsletters pas encore parties. */
export async function unsubscribe(token: string): Promise<boolean> {
  if (!token) return false;
  const db = getDb();
  const now = new Date();
  return db.transaction(async (tx) => {
    const [contact] = await tx.select().from(contacts).where(eq(contacts.unsubscribeToken, token));
    if (!contact) return false;
    if (contact.newsletterStatus !== "unsubscribed") {
      await tx
        .update(contacts)
        .set({ newsletterStatus: "unsubscribed", unsubscribedAt: now, updatedAt: now })
        .where(eq(contacts.id, contact.id));
    }
    await tx
      .delete(outbox)
      .where(and(eq(outbox.contactId, contact.id), eq(outbox.status, "pending"), eq(outbox.kind, "newsletter")));
    return true;
  });
}

/** Ajout manuel par Honorat d'une personne qui a donné son accord par ailleurs. */
export async function addSubscriberManually(email: string, firstName: string | null, note: string) {
  const db = getDb();
  const now = new Date();
  const [existing] = await db.select().from(contacts).where(eq(contacts.email, email));
  if (existing) {
    await db
      .update(contacts)
      .set({
        newsletterStatus: "subscribed",
        firstName: existing.firstName ?? firstName,
        consentAt: now,
        consentSource: note,
        confirmedAt: now,
        unsubscribedAt: null,
        updatedAt: now,
      })
      .where(eq(contacts.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(contacts)
    .values({
      email,
      firstName,
      source: "manual",
      newsletterStatus: "subscribed",
      consentAt: now,
      consentSource: note,
      confirmedAt: now,
      unsubscribeToken: randomToken(),
    })
    .returning({ id: contacts.id });
  return created!.id;
}
