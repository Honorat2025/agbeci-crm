"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { addNote, deleteNote, NOTE_CHANNELS, type NoteChannel, ensureContact, parseContactsCsv, parseTags, splitName, updateContact } from "@/lib/contacts";
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
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Adresse email invalide." };
  const { id, created } = await ensureContact(email.data, {
    firstName: clean(form.get("firstName")),
    lastName: clean(form.get("lastName")),
    company: clean(form.get("company")),
    source: "manual",
  });
  if (!created) return { error: "Cette adresse a déjà une fiche." , ok: undefined };
  redirect(`/app/contacts/${id}`);
}

export async function saveContact(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: "Fiche introuvable." };
  await updateContact(id, {
    firstName: clean(form.get("firstName")),
    lastName: clean(form.get("lastName")),
    company: clean(form.get("company")),
    jobTitle: clean(form.get("jobTitle")),
    phone: clean(form.get("phone"), 50),
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
  const rows = parseContactsCsv(await file.text());
  if (!rows.length) {
    return { error: "Aucune adresse email trouvée. Vérifiez que c'est bien un export « Google CSV » de Google Contacts." };
  }
  let created = 0;
  for (const r of rows) {
    const res = await ensureContact(r.email, { ...r, tags: ["google-contacts", ...(r.tags ?? [])], source: "import" });
    if (res.created) created += 1;
  }
  revalidatePath("/app/contacts");
  return { ok: `${rows.length} contact(s) lus : ${created} nouvelle(s) fiche(s), ${rows.length - created} déjà connue(s) et complétée(s).` };
}
