"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { addNote, deleteNote, getContact, getContactByEmail, NOTE_CHANNELS, type NoteChannel, ensureContact, normalizeLinkedin, parseAnyContactsCsv, parseTags, phoneKey, splitName, updateContact, upsertContact } from "@/lib/contacts";
import { mergeContacts } from "@/lib/merge";
import { emailSchema } from "@/lib/validation";

export type FormState = { error?: string; ok?: string };

const clean = (v: FormDataEntryValue | null, max = 200) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};

/** Bouton « Créer une fiche » depuis une conversation. */
export async function createContactFromAddress(form: FormData) {
  await requireAdmin();
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return;
  const { id } = await ensureContact(email.data, { ...splitName(clean(form.get("name"))), source: "gmail" });
  revalidatePath("/app/contacts");
  redirect(`/app/contacts/${id}`);
}

export async function createContact(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const rawEmail = clean(form.get("email"));
  const email = rawEmail ? emailSchema.safeParse(rawEmail) : null;
  if (email && !email.success) return { error: "Adresse email invalide." };
  const phone = clean(form.get("phone"), 50);
  const rawLinkedin = clean(form.get("linkedinUrl"), 300);
  const linkedinUrl = normalizeLinkedin(rawLinkedin);
  if (rawLinkedin && !linkedinUrl) return { error: "Le lien LinkedIn doit ressembler à https://www.linkedin.com/in/nom-prenom" };
  if (!email && !phoneKey(phone) && !linkedinUrl) return { error: "Indiquez au moins un email, un numéro de téléphone ou un profil LinkedIn." };
  const { id, created } = await upsertContact({
    email: email?.data ?? null,
    phone,
    linkedinUrl,
    firstName: clean(form.get("firstName")),
    lastName: clean(form.get("lastName")),
    company: clean(form.get("company")),
    source: "manual",
  });
  if (!created) return { error: "Cette personne a déjà une fiche (même email, téléphone ou profil LinkedIn)." };
  redirect(`/app/contacts/${id}`);
}

export async function saveContact(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: "Fiche introuvable." };
  const current = await getContact(id);
  if (!current) return { error: "Fiche introuvable." };
  const rawLinkedin = clean(form.get("linkedinUrl"), 300);
  const linkedinUrl = normalizeLinkedin(rawLinkedin);
  if (rawLinkedin && !linkedinUrl) return { error: "Le lien LinkedIn doit ressembler à https://www.linkedin.com/in/nom-prenom" };
  // L'email ne s'ajoute qu'à une fiche qui n'en a pas (il sert aussi à la newsletter).
  let email: string | undefined;
  const rawEmail = clean(form.get("email"));
  if (!current.email && rawEmail) {
    const parsed = emailSchema.safeParse(rawEmail);
    if (!parsed.success) return { error: "Adresse email invalide." };
    const other = await getContactByEmail(parsed.data);
    if (other && other.id !== id) return { error: "Cette adresse email appartient déjà à une autre fiche." };
    email = parsed.data;
  }
  await updateContact(id, {
    ...(email ? { email } : {}),
    linkedinUrl,
    firstName: clean(form.get("firstName")),
    lastName: clean(form.get("lastName")),
    company: clean(form.get("company")),
    jobTitle: clean(form.get("jobTitle")),
    phone: clean(form.get("phone"), 50),
    phone2: clean(form.get("phone2"), 50),
    phone3: clean(form.get("phone3"), 50),
    country: clean(form.get("country"), 80),
    tags: parseTags(String(form.get("tags") ?? "")),
  });
  revalidatePath(`/app/contacts/${id}`);
  return { ok: "Fiche enregistrée." };
}

export async function saveNote(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = Number(form.get("contactId"));
  const body = String(form.get("body") ?? "").trim();
  if (!Number.isInteger(id)) return { error: "Fiche introuvable." };
  if (!body) return { error: "La note est vide." };
  const raw = String(form.get("channel") ?? "note");
  const channel: NoteChannel = raw in NOTE_CHANNELS ? (raw as NoteChannel) : "note";
  await addNote(id, body, channel);
  revalidatePath(`/app/contacts/${id}`);
  return { ok: "Note ajoutée." };
}

export async function removeNote(form: FormData) {
  await requireAdmin();
  const noteId = Number(form.get("noteId"));
  const contactId = Number(form.get("contactId"));
  if (Number.isInteger(noteId)) await deleteNote(noteId);
  revalidatePath(`/app/contacts/${contactId}`);
}

/** Ajoute les personnes cochées dans la liste des suggestions. */
export async function addSuggested(form: FormData) {
  await requireAdmin();
  const picked = form.getAll("pick").map(String);
  for (const value of picked.slice(0, 500)) {
    const [address, name] = value.split("\u0000");
    const email = emailSchema.safeParse(address);
    if (email.success) await ensureContact(email.data, { ...splitName(name), source: "gmail", tags: ["gmail"] });
  }
  revalidatePath("/app/contacts");
  redirect(`/app/contacts/suggestions?ajoutes=${picked.length}`);
}

export async function importCsv(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier CSV." };
  if (file.size > 5_000_000) return { error: "Le fichier est trop gros (5 Mo maximum)." };
  const { format, rows } = parseAnyContactsCsv(await file.text());
  if (!rows.length) {
    return { error: "Aucun contact trouvé. Vérifiez que c'est bien un export « Google CSV » de Google Contacts, ou le fichier Connections.csv de LinkedIn." };
  }
  let created = 0;
  for (const r of rows) {
    const tags = format === "linkedin" ? (r.tags ?? []) : ["google-contacts", ...(r.tags ?? [])];
    const res = await upsertContact({ ...r, tags, source: format === "linkedin" ? "linkedin" : "import" });
    if (res.created) created += 1;
  }
  revalidatePath("/app/contacts");
  const what = format === "linkedin" ? "relation(s) LinkedIn lue(s)" : "contact(s) lu(s)";
  const noEmail = rows.filter((r) => !r.email).length;
  return {
    ok: `${rows.length} ${what} : ${created} nouvelle(s) fiche(s), ${rows.length - created} déjà connue(s) et complétée(s).${noEmail ? ` ${noEmail} n'ont pas d'email (téléphone ou LinkedIn seulement).` : ""}`,
  };
}

/** Fusionne les fiches choisies sur la page de fusion. */
export async function mergeAction(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const ids = form.getAll("ids").map(Number).filter(Number.isInteger);
  const nameFrom = Number(form.get("nameFrom")) || undefined;
  let result: { id: number; merged: number };
  try {
    result = await mergeContacts(ids, nameFrom);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "La fusion n'a pas pu se faire." };
  }
  revalidatePath("/app/contacts");
  redirect(`/app/contacts/${result.id}?fusion=${result.merged}`);
}
