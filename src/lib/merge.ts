/**
 * Doublons : une même personne enregistrée sur plusieurs fiches (souvent après un import Google Contacts).
 * On les repère, puis on les fusionne en une seule fiche sans rien perdre.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { contactLabel, contactPhones, mergePhones, phoneKey } from "./contacts";

const { contacts, contactNotes, outbox, opportunities, tasks, meetings, events } = schema;

type Candidate = { id: number; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; phone2: string | null; phone3: string | null };

/** Mots qui ne disent rien de la personne (titres, articles, « null » laissé par certains exports). */
const STOP = new Set(["dr", "pr", "de", "la", "le", "les", "du", "des", "et", "of", "the", "null", "mr", "mme", "mlle", "phd", "num", "monsieur", "madame"]);

/** « Dr Morel-Frido AGBÉCI » vers ["morel", "frido", "agbeci"]. */
export function nameTokens(c: { firstName: string | null; lastName: string | null }): string[] {
  const words = `${c.firstName ?? ""} ${c.lastName ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
  return [...new Set(words)];
}

/**
 * Deux fiches sont probablement la même personne si elles ont un numéro en commun,
 * ou si tous les mots du nom le plus court se retrouvent dans l'autre (au moins deux mots) :
 * « Morel AGBECI » et « Morel Frido AGBECI », « Alida VIGNON » et « Vignon Alida ».
 */
export function looksSame(a: Candidate, b: Candidate): boolean {
  const ka = new Set(contactPhones(a).map(phoneKey).filter(Boolean));
  if (contactPhones(b).some((p) => ka.has(phoneKey(p)))) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const common = ta.filter((t) => tb.includes(t)).length;
  return common >= 2 && common === Math.min(ta.length, tb.length);
}

/** Groupes de fiches qui se ressemblent (au moins deux par groupe), les plus gros d'abord. */
export function findDuplicateGroups<T extends Candidate>(rows: T[]): T[][] {
  const parent = rows.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  // Index par mot et par numéro pour ne comparer que les fiches qui ont quelque chose en commun.
  const buckets = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const keys = [...nameTokens(r).map((t) => `n:${t}`), ...contactPhones(r).map((p) => `t:${phoneKey(p)}`)];
    for (const k of new Set(keys)) buckets.set(k, [...(buckets.get(k) ?? []), i]);
  });
  const tried = new Set<string>();
  for (const list of buckets.values()) {
    if (list.length > 200) continue; // mot trop courant (nom de famille très répandu) : on passe
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const i = list[x]!;
        const j = list[y]!;
        const pair = `${i}-${j}`;
        if (tried.has(pair)) continue;
        tried.add(pair);
        if (looksSame(rows[i]!, rows[j]!)) parent[root(i)] = root(j);
      }
    }
  }
  const groups = new Map<number, T[]>();
  rows.forEach((r, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), r]));
  return [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length || a[0]!.id - b[0]!.id);
}

const candidateColumns = {
  id: contacts.id,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  email: contacts.email,
  phone: contacts.phone,
  phone2: contacts.phone2,
  phone3: contacts.phone3,
  company: contacts.company,
  tags: contacts.tags,
};

/** Doublons possibles dans toutes les fiches. */
export async function duplicateGroups() {
  const rows = await getDb().select(candidateColumns).from(contacts).orderBy(contacts.id);
  return findDuplicateGroups(rows);
}

/** Fiches qui ressemblent à celle-ci (même nom ou même numéro). */
export async function similarContacts(id: number) {
  const rows = await getDb().select(candidateColumns).from(contacts).orderBy(contacts.id);
  const me = rows.find((r) => r.id === id);
  if (!me) return [];
  return rows.filter((r) => r.id !== id && looksSame(me, r));
}

/** Fiches à fusionner, dans l'ordre demandé. */
export async function contactsByIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await getDb().select().from(contacts).where(inArray(contacts.id, ids));
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
}

type Row = typeof contacts.$inferSelect;

/**
 * Fiche gardée : celle qui a un email (abonnée à la newsletter de préférence, car le lien de
 * désinscription en dépend), sinon la plus ancienne.
 */
export function pickKeeper(rows: Row[]): Row {
  const score = (r: Row) => (r.email ? 2 : 0) + (r.newsletterStatus === "subscribed" || r.newsletterStatus === "pending" ? 1 : 0);
  return [...rows].sort((a, b) => score(b) - score(a) || a.id - b.id)[0]!;
}

/** Aperçu de la fiche obtenue après fusion (sans rien enregistrer). */
export function mergePreview(rows: Row[], nameFrom?: number) {
  const keeper = pickKeeper(rows);
  const others = rows.filter((r) => r.id !== keeper.id);
  const ordered = [keeper, ...others];
  const chosen = rows.find((r) => r.id === nameFrom) ?? keeper;
  // Le nom choisi ; s'il est vide, le premier nom renseigné.
  const named = chosen.firstName || chosen.lastName ? chosen : (ordered.find((r) => r.firstName || r.lastName) ?? chosen);
  const first = <K extends keyof Row>(k: K) => ordered.map((r) => r[k]).find((v) => v !== null && v !== "") ?? null;
  const phones = mergePhones(...ordered.map(contactPhones));
  const otherEmails = [...new Set(others.map((r) => r.email).filter((e): e is string => Boolean(e) && e !== keeper.email))];
  return {
    keeper,
    others,
    firstName: named.firstName,
    lastName: named.lastName,
    email: keeper.email,
    phones: phones.kept,
    extraPhones: phones.extra,
    otherEmails,
    company: first("company") as string | null,
    jobTitle: first("jobTitle") as string | null,
    country: first("country") as string | null,
    linkedinUrl: first("linkedinUrl") as string | null,
    tags: [...new Set(ordered.flatMap((r) => r.tags))],
    noBulk: rows.some((r) => r.noBulk),
  };
}

/**
 * Fusionne les fiches en une seule : coordonnées, étiquettes, notes, rappels, visios, rendez-vous,
 * affaires et emails envoyés sont rattachés à la fiche gardée ; les autres fiches sont supprimées.
 * Ce qui ne tient pas dans la fiche (4e numéro, autre adresse email) est conservé dans une note.
 */
export async function mergeContacts(ids: number[], nameFrom?: number): Promise<{ id: number; merged: number }> {
  const rows = await contactsByIds([...new Set(ids)]);
  if (rows.length < 2) throw new Error("Choisissez au moins deux fiches à fusionner.");
  const p = mergePreview(rows, nameFrom);
  const keeperId = p.keeper.id;
  const otherIds = p.others.map((r) => r.id);
  const memo = [
    `Fiches fusionnées dans celle-ci : ${p.others.map((r) => [contactLabel(r), ...contactPhones(r), r.email].filter(Boolean).join(", ")).join(" ; ")}.`,
    p.otherEmails.length ? `Autre(s) adresse(s) email : ${p.otherEmails.join(", ")}.` : "",
    p.extraPhones.length ? `Autre(s) numéro(s) : ${p.extraPhones.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await getDb().transaction(async (tx) => {
    // Tout ce qui était rattaché aux autres fiches passe sur la fiche gardée.
    await tx.update(contactNotes).set({ contactId: keeperId }).where(inArray(contactNotes.contactId, otherIds));
    await tx.update(opportunities).set({ contactId: keeperId }).where(inArray(opportunities.contactId, otherIds));
    await tx.update(tasks).set({ contactId: keeperId }).where(inArray(tasks.contactId, otherIds));
    await tx.update(meetings).set({ contactId: keeperId }).where(inArray(meetings.contactId, otherIds));
    await tx.update(events).set({ contactId: keeperId }).where(inArray(events.contactId, otherIds));
    // Emails : une seule ligne par newsletter et par fiche ; les envois en double restent sur l'ancienne fiche et disparaissent avec elle.
    await tx
      .update(outbox)
      .set({ contactId: keeperId })
      .where(
        sql`${outbox.contactId} IN (${sql.join(otherIds.map((i) => sql`${i}`), sql`, `)})
          AND (${outbox.newsletterId} IS NULL OR NOT EXISTS (
            SELECT 1 FROM outbox o2 WHERE o2.contact_id = ${keeperId} AND o2.newsletter_id = ${outbox.newsletterId}))`,
      );
    // Les autres fiches disparaissent avant la mise à jour (le profil LinkedIn ne peut être que sur une fiche).
    await tx.delete(contacts).where(inArray(contacts.id, otherIds));
    await tx
      .update(contacts)
      .set({
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phones[0],
        phone2: p.phones[1],
        phone3: p.phones[2],
        company: p.company,
        jobTitle: p.jobTitle,
        country: p.country,
        linkedinUrl: p.linkedinUrl,
        tags: p.tags,
        noBulk: p.noBulk,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, keeperId));
    await tx.insert(contactNotes).values({ contactId: keeperId, body: memo, channel: "note" });
  });
  return { id: keeperId, merged: otherIds.length };
}
