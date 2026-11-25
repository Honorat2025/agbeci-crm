/**
 * Recopie de la boîte Gmail dans le CRM, par IMAP (mot de passe d'application).
 * On lit le dossier « Tous les messages » : il contient les emails reçus et envoyés.
 * Gmail reste la référence. Une suppression depuis le CRM met le message dans la Corbeille de Gmail
 * (récupérable pendant 30 jours), jamais de suppression définitive.
 */
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import sanitizeHtml from "sanitize-html";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getMailSettings } from "./settings";

const { mailMessages, mailSync, mailActions } = schema;

/** Historique recopié au premier branchement. */
export const HISTORY_DAYS = 365;
/** Nombre de messages recopiés par passage, pour ne pas surcharger le serveur. */
const BATCH = 100;
/** Taille maximale d'un message téléchargé (les pièces jointes ne sont pas gardées). */
const MAX_SOURCE_BYTES = 2_000_000;

type Addr = { name?: string; address: string };

function addresses(field: AddressObject | AddressObject[] | undefined): Addr[] {
  if (!field) return [];
  const list = Array.isArray(field) ? field : [field];
  const out: Addr[] = [];
  for (const group of list) {
    for (const a of group.value) {
      if (a.address) out.push({ name: a.name || undefined, address: a.address.toLowerCase() });
      for (const g of a.group ?? []) {
        if (g.address) out.push({ name: g.name || undefined, address: g.address.toLowerCase() });
      }
    }
  }
  return out;
}

export function makeSnippet(text: string): string {
  return text
    .split("\n")
    .filter((l) => !l.startsWith(">"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** HTML d'un email reçu, nettoyé : ni scripts, ni formulaires, ni styles dangereux. */
export function cleanEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "center", "font", "span", "div", "style"]),
    allowedAttributes: {
      "*": ["style", "align", "width", "height", "bgcolor", "color", "dir"],
      a: ["href", "title"],
      img: ["src", "alt", "width", "height", "style"],
      font: ["face", "size", "color"],
      td: ["colspan", "rowspan", "valign", "align", "width", "style", "bgcolor"],
      th: ["colspan", "rowspan", "valign", "align", "width", "style", "bgcolor"],
      table: ["cellpadding", "cellspacing", "border", "width", "style", "bgcolor", "align"],
    },
    allowedSchemes: ["http", "https", "mailto", "cid", "data"],
    allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
    allowVulnerableTags: true,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}

/** Retire les images externes (souvent des traceurs) tant qu'Honorat ne demande pas à les voir. */
export function blockRemoteImages(html: string): { html: string; blocked: number } {
  let blocked = 0;
  const out = html.replace(/<img\b[^>]*\bsrc\s*=\s*["']?https?:[^>]*>/gi, () => {
    blocked += 1;
    return "";
  });
  return { html: out, blocked };
}

export type ImportedMessage = typeof mailMessages.$inferInsert;

/** Transforme un message Gmail (métadonnées IMAP + contenu analysé) en ligne de la base. */
export function toRow(
  meta: Pick<FetchMessageObject, "uid" | "emailId" | "threadId" | "labels" | "flags" | "internalDate">,
  parsed: ParsedMail,
  ownAddress: string,
): ImportedMessage {
  const from = addresses(parsed.from)[0];
  const to = addresses(parsed.to);
  const cc = addresses(parsed.cc);
  const bcc = addresses(parsed.bcc);
  const own = ownAddress.toLowerCase();
  const participants = [...new Set([from?.address, ...to.map((a) => a.address), ...cc.map((a) => a.address), ...bcc.map((a) => a.address)])]
    .filter((a): a is string => Boolean(a));
  const textBody = (parsed.text ?? "").slice(0, 200_000);
  const html = typeof parsed.html === "string" ? cleanEmailHtml(parsed.html).slice(0, 500_000) : null;
  const refs = parsed.references ? (Array.isArray(parsed.references) ? parsed.references.join(" ") : parsed.references) : null;
  const date = parsed.date ?? (meta.internalDate ? new Date(meta.internalDate) : new Date());
  return {
    gmailId: String(meta.emailId ?? `uid-${meta.uid}`),
    threadId: String(meta.threadId ?? meta.emailId ?? `uid-${meta.uid}`),
    uid: meta.uid,
    messageIdHeader: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    references: refs,
    fromEmail: from?.address ?? "",
    fromName: from?.name ?? null,
    to,
    cc,
    participants,
    subject: (parsed.subject ?? "").slice(0, 1000),
    snippet: makeSnippet(textBody),
    textBody,
    htmlBody: html,
    attachments: (parsed.attachments ?? [])
      .filter((a) => a.contentDisposition !== "inline" || !a.contentId)
      .map((a) => ({ filename: a.filename ?? "pièce jointe", size: a.size, contentType: a.contentType })),
    labels: [...(meta.labels ?? [])],
    outgoing: from?.address === own,
    seen: meta.flags?.has("\\Seen") ?? false,
    date,
  };
}

export async function storeRows(rows: ImportedMessage[]) {
  if (!rows.length) return;
  await getDb()
    .insert(mailMessages)
    .values(rows)
    .onConflictDoUpdate({
      target: mailMessages.gmailId,
      set: { uid: sql`excluded.uid`, labels: sql`excluded.labels`, seen: sql`excluded.seen` },
    });
}

async function fetchAndStore(client: ImapFlow, uids: number[], ownAddress: string): Promise<number> {
  if (!uids.length) return 0;
  const rows: ImportedMessage[] = [];
  for await (const msg of client.fetch(
    uids,
    { uid: true, flags: true, labels: true, threadId: true, internalDate: true, size: true, source: { maxLength: MAX_SOURCE_BYTES } },
    { uid: true },
  )) {
    if (!msg.source) continue;
    try {
      const parsed = await simpleParser(msg.source, { skipImageLinks: true, skipTextToHtml: true });
      rows.push(toRow(msg, parsed, ownAddress));
    } catch (err) {
      console.error(`Message ${msg.uid} illisible :`, err instanceof Error ? err.message : err);
    }
  }
  await storeRows(rows);
  return rows.length;
}

function connect(address: string, password: string) {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: address, pass: password },
    logger: false,
    socketTimeout: 120_000,
  });
}

/** Trouve le dossier « Tous les messages » de Gmail (son nom dépend de la langue du compte). */
async function allMailPath(client: ImapFlow): Promise<string> {
  const boxes = await client.list();
  return boxes.find((b) => b.specialUse === "\\All")?.path ?? "[Gmail]/All Mail";
}

export type SyncResult = { added: number; updated: number; backfillDone: boolean };

/**
 * Un passage de synchronisation :
 * 1. les nouveaux messages arrivés depuis la dernière fois ;
 * 2. les changements (lu / non lu, libellés) sur les messages connus ;
 * 3. un lot de l'historique, en remontant le temps, jusqu'à HISTORY_DAYS jours.
 */
export async function syncMailbox(): Promise<SyncResult | null> {
  const settings = await getMailSettings();
  if (!settings.configured) return null;
  const db = getDb();
  const client = connect(settings.address, settings.password);
  await client.connect();
  try {
    await applyPendingActions(client);
    const path = await allMailPath(client);
    const lock = await client.getMailboxLock(path, { readOnly: false });
    try {
      const box = client.mailbox;
      if (!box) throw new Error("Dossier Gmail introuvable");
      const uidValidity = String(box.uidValidity);
      let [state] = await db.select().from(mailSync).where(eq(mailSync.id, 1));

      // Premier branchement, ou Gmail a renuméroté le dossier : on repart de zéro.
      if (!state || state.uidValidity !== uidValidity || state.account !== settings.address) {
        if (state) await db.delete(mailMessages);
        const fresh = {
          id: 1,
          account: settings.address,
          mailbox: path,
          uidValidity,
          lastUid: box.uidNext - 1,
          backfillBeforeUid: box.uidNext,
          backfillDone: false,
          highestModseq: box.highestModseq ?? null,
        };
        await db.insert(mailSync).values(fresh).onConflictDoUpdate({ target: mailSync.id, set: fresh });
        [state] = await db.select().from(mailSync).where(eq(mailSync.id, 1));
      }
      if (!state) throw new Error("État de synchronisation introuvable");

      let added = 0;
      let updated = 0;

      // 1. Nouveaux messages.
      if (box.uidNext - 1 > state.lastUid) {
        const fresh = (await client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true })) || [];
        const newUids = fresh.filter((u) => u > state!.lastUid).sort((a, b) => a - b).slice(0, BATCH);
        added += await fetchAndStore(client, newUids, settings.address);
        const maxUid = newUids.length ? Math.max(...newUids) : state.lastUid;
        state.lastUid = newUids.length < BATCH ? Math.max(maxUid, box.uidNext - 1) : maxUid;
      }

      // 2. Changements de statut (lu, libellés) depuis la dernière fois.
      if (state.highestModseq && box.highestModseq && box.highestModseq > state.highestModseq) {
        for await (const msg of client.fetch(
          `1:${state.lastUid || 1}`,
          { uid: true, flags: true, labels: true },
          { uid: true, changedSince: state.highestModseq },
        )) {
          if (!msg.emailId) continue;
          const res = await db
            .update(mailMessages)
            .set({ seen: msg.flags?.has("\\Seen") ?? false, labels: [...(msg.labels ?? [])] })
            .where(eq(mailMessages.gmailId, String(msg.emailId)))
            .returning({ id: mailMessages.id });
          updated += res.length;
        }
      }

      // 3. Historique, par lots, du plus récent au plus ancien.
      let backfillDone = state.backfillDone;
      if (!backfillDone && state.backfillBeforeUid > 1) {
        const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
        const older = (await client.search({ uid: `1:${state.backfillBeforeUid - 1}`, since }, { uid: true })) || [];
        const batch = older.filter((u) => u < state!.backfillBeforeUid).sort((a, b) => b - a).slice(0, BATCH);
        if (batch.length) {
          added += await fetchAndStore(client, batch, settings.address);
          state.backfillBeforeUid = Math.min(...batch);
        }
        if (batch.length < BATCH) backfillDone = true;
      } else {
        backfillDone = true;
      }

      await db
        .update(mailSync)
        .set({
          lastUid: state.lastUid,
          backfillBeforeUid: state.backfillBeforeUid,
          backfillDone,
          highestModseq: box.highestModseq ?? state.highestModseq,
          lastSyncAt: new Date(),
          lastError: null,
          requestedAt: null,
        })
        .where(eq(mailSync.id, 1));
      return { added, updated, backfillDone };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export async function recordSyncError(message: string) {
  await getDb().update(mailSync).set({ lastError: message.slice(0, 500), lastSyncAt: new Date() }).where(eq(mailSync.id, 1));
}

/** Demande au worker une synchronisation immédiate (bouton « Actualiser »). */
export async function requestSync() {
  await getDb().update(mailSync).set({ requestedAt: new Date() }).where(eq(mailSync.id, 1));
}

export async function syncState() {
  const [s] = await getDb().select().from(mailSync).where(eq(mailSync.id, 1));
  return s ?? null;
}

/** Marque une conversation comme lue dans le CRM, et demande au worker de faire de même dans Gmail. */
export async function markThreadSeen(threadId: string) {
  const db = getDb();
  const rows = await db
    .update(mailMessages)
    .set({ seen: true })
    .where(and(eq(mailMessages.threadId, threadId), eq(mailMessages.seen, false)))
    .returning({ uid: mailMessages.uid });
  if (rows.length) await db.insert(mailActions).values({ action: "seen", uids: rows.map((r) => r.uid) });
  return rows.length;
}

/**
 * Met des conversations à la corbeille : elles disparaissent tout de suite du CRM, et le worker
 * les déplace dans la Corbeille de Gmail au prochain passage (Gmail les garde 30 jours).
 */
export async function trashThreads(threadIds: string[]): Promise<number> {
  const ids = [...new Set(threadIds.filter(Boolean))].slice(0, 200);
  if (!ids.length) return 0;
  const db = getDb();
  return db.transaction(async (tx) => {
    const rows = await tx.delete(mailMessages).where(inArray(mailMessages.threadId, ids)).returning({ uid: mailMessages.uid, threadId: mailMessages.threadId });
    if (rows.length) await tx.insert(mailActions).values({ action: "trash", uids: rows.map((r) => r.uid) });
    // Rendez-vous du calendrier créés depuis ces conversations : on garde le rendez-vous, sans le lien.
    await tx.update(schema.events).set({ mailThreadId: null }).where(inArray(schema.events.mailThreadId, ids));
    return new Set(rows.map((r) => r.threadId)).size;
  });
}

/** Dossier Corbeille de Gmail (« [Gmail]/Corbeille » en français, « [Gmail]/Trash » en anglais). */
async function trashPath(client: ImapFlow): Promise<string> {
  const boxes = await client.list();
  const trash = boxes.find((b) => b.specialUse === "\\Trash");
  if (!trash) throw new Error("Dossier Corbeille de Gmail introuvable");
  return trash.path;
}

async function applyPendingActions(client: ImapFlow) {
  const db = getDb();
  const actions = await db.select().from(mailActions).limit(50);
  if (!actions.length) return;
  const [state] = await db.select().from(mailSync).where(eq(mailSync.id, 1));
  if (!state) return;
  const lock = await client.getMailboxLock(state.mailbox);
  const done: number[] = [];
  try {
    for (const a of actions) {
      // Une action qui échoue ne bloque ni les autres ni la relève ; elle est retentée au passage suivant, pendant 24 h.
      try {
        if (a.action === "seen" && a.uids.length) {
          await client.messageFlagsAdd(a.uids, ["\\Seen"], { uid: true });
        }
        if (a.action === "trash" && a.uids.length) {
          await client.messageMove(a.uids, await trashPath(client), { uid: true });
        }
        done.push(a.id);
      } catch (e) {
        console.error(`Action Gmail « ${a.action} » impossible :`, e instanceof Error ? e.message : e);
        if (Date.now() - a.createdAt.getTime() > 86_400_000) done.push(a.id);
      }
    }
  } finally {
    lock.release();
  }
  if (done.length) await db.delete(mailActions).where(inArray(mailActions.id, done));
}
