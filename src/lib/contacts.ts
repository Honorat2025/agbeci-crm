/**
 * Fiches contacts : coordonnées, notes, historique des échanges, suggestions.
 */
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb, getSql, schema } from "@/db";
import { randomToken } from "./crypto";
import { getMailSettings } from "./settings";

const { contacts, contactNotes } = schema;


export async function listContacts(opts: { q?: string; tag?: string } = {}) {
  const filters: SQL[] = [];
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().replace(/[%_\\]/g, "")}%`;
    filters.push(
      or(
        ilike(contacts.email, like),
        ilike(contacts.firstName, like),
        ilike(contacts.lastName, like),
        ilike(contacts.company, like),
        ilike(contacts.country, like),
      )!,
    );
  }
  if (opts.tag) filters.push(sql`${opts.tag} = ANY(${contacts.tags})`);
  return getDb()
    .select()
    .from(contacts)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(contacts.updatedAt))
    .limit(500);
}

export async function getContact(id: number) {
  const [c] = await getDb().select().from(contacts).where(eq(contacts.id, id));
  return c ?? null;
}

export async function getContactByEmail(email: string) {
  const [c] = await getDb().select().from(contacts).where(eq(contacts.email, email.toLowerCase()));
  return c ?? null;
}

export type ContactInput = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  phone: string | null;
  country: string | null;
  tags: string[];
};

export function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

export async function updateContact(id: number, input: ContactInput) {
  await getDb()
    .update(contacts)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(contacts.id, id));
}

/**
 * Crée une fiche (sans abonnement à la newsletter) ou retourne celle qui existe.
 * L'abonnement reste réservé au formulaire avec double confirmation.
 */
export async function ensureContact(
  email: string,
  data: Partial<ContactInput> & { source: string },
): Promise<{ id: number; created: boolean }> {
  const normalized = email.trim().toLowerCase();
  const existing = await getContactByEmail(normalized);
  if (existing) {
    // On complète seulement les champs vides : on n'écrase jamais ce qu'Honorat a saisi.
    const patch: Partial<typeof contacts.$inferInsert> = {};
    if (!existing.firstName && data.firstName) patch.firstName = data.firstName;
    if (!existing.lastName && data.lastName) patch.lastName = data.lastName;
    if (!existing.company && data.company) patch.company = data.company;
    if (!existing.phone && data.phone) patch.phone = data.phone;
    if (data.tags?.length) patch.tags = [...new Set([...existing.tags, ...data.tags])];
    if (Object.keys(patch).length) {
      await getDb().update(contacts).set({ ...patch, updatedAt: new Date() }).where(eq(contacts.id, existing.id));
    }
    return { id: existing.id, created: false };
  }
  const [row] = await getDb()
    .insert(contacts)
    .values({
      email: normalized,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      company: data.company ?? null,
      jobTitle: data.jobTitle ?? null,
      phone: data.phone ?? null,
      country: data.country ?? null,
      tags: data.tags ?? [],
      source: data.source,
      unsubscribeToken: randomToken(),
    })
    .onConflictDoNothing({ target: contacts.email })
    .returning({ id: contacts.id });
  if (row) return { id: row.id, created: true };
  const again = await getContactByEmail(normalized);
  return { id: again!.id, created: false };
}

/** Sépare « Awa Koné » en prénom et nom (au mieux). */
export function splitName(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const clean = (name ?? "").replace(/["']/g, "").trim();
  if (!clean || clean.includes("@")) return { firstName: null, lastName: null };
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

export async function listNotes(contactId: number) {
  return getDb().select().from(contactNotes).where(eq(contactNotes.contactId, contactId)).orderBy(desc(contactNotes.createdAt));
}

export async function addNote(contactId: number, body: string) {
  await getDb().insert(contactNotes).values({ contactId, body: body.trim().slice(0, 10_000) });
  await getDb().update(contacts).set({ updatedAt: new Date() }).where(eq(contacts.id, contactId));
}

export async function deleteNote(noteId: number) {
  await getDb().delete(contactNotes).where(eq(contactNotes.id, noteId));
}

/** Échanges avec un contact : nombre de messages, premier et dernier échange. */
export async function exchangeStats(email: string) {
  const [row] = await getSql()<{ n: string; first: string | null; last: string | null }[]>`
    SELECT count(*) AS n, min(date) AS first, max(date) AS last
    FROM mail_messages WHERE ${email.toLowerCase()} = ANY(participants)`;
  // Les dates arrivent en texte (réglage du pilote PostgreSQL utilisé par Drizzle).
  return {
    count: Number(row?.n ?? 0),
    first: row?.first ? new Date(row.first) : null,
    last: row?.last ? new Date(row.last) : null,
  };
}

/** Adresses automatiques à ne jamais proposer comme contacts. */
const ROBOT = /(no-?reply|ne-?pas-?repondre|notification|mailer-daemon|postmaster|bounce|newsletter|info@|news@|support@|team@|hello@|contact@)/i;

/**
 * Personnes à qui Honorat a écrit lui-même, et qui n'ont pas encore de fiche.
 * Ce sont presque toujours de vraies relations (pas des publicités).
 */
export async function suggestedContacts(limit = 50) {
  const own = (await getMailSettings()).address.toLowerCase();
  const rows = await getSql()<{ address: string; name: string | null; sent: string; last: Date }[]>`
    WITH recipients AS (
      SELECT lower(r->>'address') AS address, nullif(r->>'name', '') AS name, m.date
      FROM mail_messages m, jsonb_array_elements(m."to" || m.cc) r
      WHERE m.outgoing
    )
    SELECT r.address, max(r.name) AS name, count(*) AS sent, max(r.date) AS last
    FROM recipients r
    LEFT JOIN contacts c ON c.email = r.address
    WHERE c.id IS NULL AND r.address <> ${own} AND r.address LIKE '%@%'
    GROUP BY r.address
    ORDER BY count(*) DESC, max(r.date) DESC
    LIMIT ${limit * 2}`;
  return rows
    .filter((r) => !ROBOT.test(r.address))
    .slice(0, limit)
    .map((r) => ({ address: r.address, name: r.name, sent: Number(r.sent), last: new Date(r.last) }));
}

/**
 * Lit un fichier CSV (export Google Contacts ou tableur) et en tire nom, prénom, email, téléphone, société.
 * Reconnaît les en-têtes anglais et français de Google Contacts.
 */
export function parseContactsCsv(csv: string): (Partial<ContactInput> & { email: string })[] {
  const rows = parseCsv(csv.replace(/^﻿/, ""));
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const find = (...names: RegExp[]) => header.findIndex((h) => names.some((n) => n.test(h)));
  const iEmail = find(/^e-?mail 1 - value$/, /^e-?mail 1 - valeur$/, /^e-?mail( address)?$/, /^adresse e-?mail$/, /^courriel$/);
  const iFirst = find(/^first name$/, /^given name$/, /^prénom$/);
  const iLast = find(/^last name$/, /^family name$/, /^nom de famille$/, /^nom$/);
  const iName = find(/^name$/, /^nom complet$/);
  const iPhone = find(/^phone 1 - value$/, /^téléphone 1 - valeur$/, /^phone$/, /^téléphone$/);
  const iCompany = find(/^organization name$/, /^organization 1 - name$/, /^organisation 1 - nom$/, /^société$/, /^entreprise$/, /^company$/);
  const iTitle = find(/^organization title$/, /^organization 1 - title$/, /^organisation 1 - titre$/, /^fonction$/, /^job title$/);
  const iLabels = find(/^labels$/, /^libellés$/, /^group membership$/, /^groupes$/, /^étiquettes$/);
  if (iEmail < 0) return [];
  const out: (Partial<ContactInput> & { email: string })[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(1)) {
    const raw = (r[iEmail] ?? "").split(":::")[0]!.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || seen.has(raw)) continue;
    seen.add(raw);
    const fromName = iName >= 0 ? splitName(r[iName]) : { firstName: null, lastName: null };
    const val = (i: number) => (i >= 0 ? (r[i] ?? "").split(":::")[0]!.trim() || null : null);
    out.push({
      email: raw,
      firstName: val(iFirst) ?? fromName.firstName,
      lastName: val(iLast) ?? fromName.lastName,
      phone: val(iPhone),
      company: val(iCompany),
      jobTitle: val(iTitle),
      tags: iLabels >= 0 ? googleLabelsToTags(r[iLabels] ?? "") : [],
    });
  }
  return out;
}

/**
 * Groupes Google Contacts (« ONG Afrique ::: * myContacts ») vers étiquettes du CRM (« ong afrique »).
 * Les groupes système de Google (commençant par « * ») sont ignorés.
 */
export function googleLabelsToTags(value: string): string[] {
  return parseTags(
    value
      .split(":::")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("*"))
      .map((l) => l.replace(/,/g, " ").slice(0, 40))
      .join(","),
  );
}

/** Petit lecteur CSV (guillemets, virgules ou points-virgules, retours à la ligne dans les champs). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}
