/**
 * Fiches contacts : coordonnées, notes, historique des échanges, suggestions.
 */
import { and, desc, eq, ilike, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
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
        ilike(contacts.phone, like),
        ilike(contacts.phone2, like),
        ilike(contacts.phone3, like),
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
  phone2?: string | null;
  phone3?: string | null;
  country: string | null;
  linkedinUrl: string | null;
  tags: string[];
};

/** Nom à afficher : nom complet, sinon email, téléphone ou profil LinkedIn. */
export function contactLabel(c: { firstName: string | null; lastName: string | null; email: string | null; phone?: string | null; linkedinUrl?: string | null }): string {
  return (
    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
    c.email ||
    c.phone ||
    (c.linkedinUrl ? `LinkedIn : ${c.linkedinUrl.replace(/^https:\/\/www\.linkedin\.com\/in\//, "")}` : "") ||
    "Sans nom"
  );
}

/** « linkedin.com/in/Awa-Kone/?x=1 » vers « https://www.linkedin.com/in/awa-kone » ; null si ce n'est pas un profil. */
export function normalizeLinkedin(value: string | null | undefined): string | null {
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^/?#\s]+)/i.exec((value ?? "").trim());
  if (!m) return null;
  let handle = m[1]!;
  try {
    handle = decodeURIComponent(handle);
  } catch {
    /* garder tel quel */
  }
  return `https://www.linkedin.com/in/${encodeURIComponent(handle.toLowerCase())}`;
}

/**
 * Les 8 derniers chiffres d'un numéro : assez pour reconnaître un même numéro écrit de deux façons
 * (+225 07 12 34 56 78 et 07 12 34 56 78, ou l'ancien et le nouveau format du Bénin : +229 97 00 00 00 et +229 01 97 00 00 00).
 */
export function phoneKey(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : null;
}

/** Numéros de la fiche, dans l'ordre (Téléphone 1, 2, 3). */
export function contactPhones(c: { phone?: string | null; phone2?: string | null; phone3?: string | null }): string[] {
  return [c.phone, c.phone2, c.phone3].map((p) => p?.trim() ?? "").filter(Boolean);
}

/**
 * Réunit plusieurs listes de numéros sans doublon (même numéro écrit autrement), dans l'ordre.
 * Retourne les 3 premiers (Téléphone 1, 2, 3) et ceux qui dépassent.
 */
export function mergePhones(...lists: (string | null | undefined)[][]): { kept: [string | null, string | null, string | null]; extra: string[] } {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of lists.flat()) {
    const v = p?.trim();
    if (!v) continue;
    const k = phoneKey(v) ?? v;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return { kept: [out[0] ?? null, out[1] ?? null, out[2] ?? null], extra: out.slice(3) };
}

export function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

export async function updateContact(id: number, input: ContactInput & { email?: string }) {
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
  return upsertContact({ ...data, email });
}

/** Retrouve une fiche par email, sinon par profil LinkedIn, sinon (sans email) par numéro de téléphone. */
async function findExisting(email: string | null, linkedinUrl: string | null, phones: string[]) {
  const db = getDb();
  if (email) {
    const c = await getContactByEmail(email);
    if (c) return c;
  }
  if (linkedinUrl) {
    const [c] = await db.select().from(contacts).where(eq(contacts.linkedinUrl, linkedinUrl));
    if (c) return c;
  }
  const keys = !email ? phones.map(phoneKey).filter((k): k is string => Boolean(k)) : [];
  if (keys.length) {
    const col = (c: AnyColumn) => sql`right(regexp_replace(coalesce(${c}, ''), '[^0-9]', '', 'g'), 8)`;
    const list = sql.join(keys.map((k) => sql`${k}`), sql`, `);
    const [c] = await db
      .select()
      .from(contacts)
      .where(sql`(${col(contacts.phone)} IN (${list}) OR ${col(contacts.phone2)} IN (${list}) OR ${col(contacts.phone3)} IN (${list}))`)
      .orderBy(contacts.id)
      .limit(1);
    if (c) return c;
  }
  return null;
}

/**
 * Crée ou complète une fiche. L'email est facultatif : il faut au moins un email, un téléphone ou un profil LinkedIn.
 * On complète seulement les champs vides : on n'écrase jamais ce qu'Honorat a saisi.
 */
export async function upsertContact(
  data: Partial<ContactInput> & { email?: string | null; source: string },
): Promise<{ id: number; created: boolean }> {
  const normalized = data.email?.trim().toLowerCase() || null;
  const linkedinUrl = normalizeLinkedin(data.linkedinUrl);
  const phones = mergePhones([data.phone, data.phone2, data.phone3]).kept.filter((p): p is string => Boolean(p));
  const phone = phones[0] ?? null;
  if (!normalized && !linkedinUrl && !phones.some((p) => phoneKey(p))) throw new Error("Il faut au moins un email, un téléphone ou un profil LinkedIn.");
  const existing = await findExisting(normalized, linkedinUrl, phones);
  if (existing) {
    // On complète seulement les champs vides : on n'écrase jamais ce qu'Honorat a saisi.
    const patch: Partial<typeof contacts.$inferInsert> = {};
    if (!existing.firstName && data.firstName) patch.firstName = data.firstName;
    if (!existing.lastName && data.lastName) patch.lastName = data.lastName;
    if (!existing.company && data.company) patch.company = data.company;
    const before = contactPhones(existing);
    const merged = mergePhones(before, phones).kept;
    // Les numéros déjà saisis restent à leur place ; les nouveaux remplissent les cases vides.
    if (merged.filter(Boolean).length > before.length) [patch.phone, patch.phone2, patch.phone3] = merged;
    if (!existing.email && normalized) patch.email = normalized;
    if (!existing.jobTitle && data.jobTitle) patch.jobTitle = data.jobTitle;
    if (!existing.country && data.country) patch.country = data.country;
    if (!existing.linkedinUrl && linkedinUrl) patch.linkedinUrl = linkedinUrl;
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
      phone,
      phone2: phones[1] ?? null,
      phone3: phones[2] ?? null,
      country: data.country ?? null,
      linkedinUrl,
      tags: data.tags ?? [],
      source: data.source,
      unsubscribeToken: randomToken(),
    })
    .onConflictDoNothing()
    .returning({ id: contacts.id });
  if (row) return { id: row.id, created: true };
  // Créée entre-temps par un autre envoi (même email ou même profil).
  const again = await findExisting(normalized, linkedinUrl, phones);
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

export const NOTE_CHANNELS = { note: "Note", whatsapp: "Échange WhatsApp", linkedin: "Échange LinkedIn", appel: "Appel téléphonique" } as const;
export type NoteChannel = keyof typeof NOTE_CHANNELS;

export async function addNote(contactId: number, body: string, channel: NoteChannel = "note") {
  await getDb().insert(contactNotes).values({ contactId, body: body.trim().slice(0, 10_000), channel });
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

export type ContactRow = Partial<ContactInput> & { email: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lit un fichier CSV (export Google Contacts ou tableur) et en tire nom, prénom, email, téléphone, société.
 * Reconnaît les en-têtes anglais et français de Google Contacts. Garde aussi les contacts sans email
 * qui ont un numéro de téléphone.
 */
export function parseContactsCsv(csv: string): ContactRow[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const find = (...names: RegExp[]) => header.findIndex((h) => names.some((n) => n.test(h)));
  const iEmail = find(/^e-?mail 1 - value$/, /^e-?mail 1 - valeur$/, /^e-?mail( address)?$/, /^adresse e-?mail$/, /^courriel$/);
  const iFirst = find(/^first name$/, /^given name$/, /^prénom$/);
  const iLast = find(/^last name$/, /^family name$/, /^nom de famille$/, /^nom$/);
  const iName = find(/^name$/, /^nom complet$/);
  // Toutes les colonnes de numéros : « Phone 1 - Value », « Phone 2 - Value »... ou « Téléphone ».
  const iPhones = header
    .map((h, i) => [h, i] as const)
    .filter(([h]) => /^(phone|téléphone) \d+ - (value|valeur)$/.test(h) || /^(phone|téléphone|mobile|portable)$/.test(h))
    .map(([, i]) => i);
  const iCompany = find(/^organization name$/, /^organization 1 - name$/, /^organisation 1 - nom$/, /^société$/, /^entreprise$/, /^company$/);
  const iTitle = find(/^organization title$/, /^organization 1 - title$/, /^organisation 1 - titre$/, /^fonction$/, /^job title$/);
  const iLabels = find(/^labels$/, /^libellés$/, /^group membership$/, /^groupes$/, /^étiquettes$/);
  if (iEmail < 0 && !iPhones.length) return [];
  const out: ContactRow[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(1)) {
    const val = (i: number) => {
      const v = i >= 0 ? (r[i] ?? "").split(":::")[0]!.trim() : "";
      return v && v.toLowerCase() !== "null" ? v : null;
    };
    const rawEmail = (val(iEmail) ?? "").toLowerCase();
    const email = EMAIL_RE.test(rawEmail) ? rawEmail : null;
    const [phone, phone2, phone3] = mergePhones(iPhones.flatMap((i) => (r[i] ?? "").split(":::"))).kept;
    const telKey = [phone, phone2, phone3].map(phoneKey).find(Boolean);
    const key = email ?? (telKey ? `tel:${telKey}` : null);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const fromName = iName >= 0 ? splitName(r[iName]) : { firstName: null, lastName: null };
    out.push({
      email,
      firstName: val(iFirst) ?? fromName.firstName,
      lastName: val(iLast) ?? fromName.lastName,
      phone,
      phone2,
      phone3,
      company: val(iCompany),
      jobTitle: val(iTitle),
      tags: iLabels >= 0 ? googleLabelsToTags(r[iLabels] ?? "") : [],
    });
  }
  return out;
}

/**
 * Relations LinkedIn (fichier « Connections.csv » de l'archive de données LinkedIn) :
 * quelques lignes d'explication, puis First Name, Last Name, URL, Email Address, Company, Position, Connected On.
 */
export function parseLinkedinCsv(csv: string): ContactRow[] {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  const h = rows.findIndex((r) => r.some((c) => /^first name$/i.test(c.trim())) && r.some((c) => /^url$/i.test(c.trim())));
  if (h < 0) return [];
  const header = rows[h]!.map((c) => c.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [iFirst, iLast, iUrl, iEmail, iCompany, iPosition] = ["first name", "last name", "url", "email address", "company", "position"].map(col) as [number, number, number, number, number, number];
  const out: ContactRow[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(h + 1)) {
    const val = (i: number) => (i >= 0 ? (r[i] ?? "").trim() || null : null);
    const linkedinUrl = normalizeLinkedin(val(iUrl));
    const rawEmail = (val(iEmail) ?? "").toLowerCase();
    const email = EMAIL_RE.test(rawEmail) ? rawEmail : null;
    const key = linkedinUrl ?? email;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ email, linkedinUrl, firstName: val(iFirst), lastName: val(iLast), company: val(iCompany), jobTitle: val(iPosition), tags: ["linkedin"] });
  }
  return out;
}

/** Reconnaît le format (LinkedIn ou Google Contacts / tableur). */
export function parseAnyContactsCsv(csv: string): { format: "linkedin" | "google"; rows: ContactRow[] } {
  const linkedin = parseLinkedinCsv(csv);
  if (linkedin.length) return { format: "linkedin", rows: linkedin };
  return { format: "google", rows: parseContactsCsv(csv) };
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
