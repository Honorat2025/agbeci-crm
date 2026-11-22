"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/guard";
import {
  createNewsletter,
  deleteDraft,
  queueNewsletter,
  queueTestSend,
  updateNewsletter,
} from "@/lib/newsletters";
import { emailSchema, newsletterSchema } from "@/lib/validation";

export type EditState = { error?: string; ok?: string };

function parse(form: FormData) {
  return newsletterSchema.safeParse({
    subject: form.get("subject"),
    preheader: form.get("preheader") ?? undefined,
    bodyMarkdown: form.get("bodyMarkdown") ?? "",
  });
}

export async function createAction(_: EditState, form: FormData): Promise<EditState> {
  await requireAdmin();
  const data = parse(form);
  if (!data.success) return { error: data.error.issues[0]?.message ?? "Formulaire invalide." };
  const n = await createNewsletter(data.data);
  redirect(`/app/newsletters/${n.id}`);
}

export async function saveAction(id: number, _: EditState, form: FormData): Promise<EditState> {
  await requireAdmin();
  const data = parse(form);
  if (!data.success) return { error: data.error.issues[0]?.message ?? "Formulaire invalide." };
  const n = await updateNewsletter(id, data.data);
  if (!n) return { error: "Cette newsletter n'est plus modifiable." };
  revalidatePath(`/app/newsletters/${id}`);
  return { ok: "Enregistré." };
}

export async function testAction(id: number, _: EditState, form: FormData): Promise<EditState> {
  await requireAdmin();
  const to = emailSchema.safeParse(form.get("to") || env.gmailAddress);
  if (!to.success) return { error: "Adresse de test invalide." };
  await queueTestSend(id, to.data);
  return { ok: `Email de test mis en file pour ${to.data}. Il part dans la minute.` };
}

export async function sendAction(id: number, _: EditState, form: FormData): Promise<EditState> {
  await requireAdmin();
  if (form.get("confirm") !== "on") return { error: "Cochez la case de confirmation avant d'envoyer." };
  try {
    const n = await queueNewsletter(id);
    revalidatePath(`/app/newsletters/${id}`);
    return { ok: `Envoi lancé vers ${n} abonné(s).` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Envoi impossible." };
  }
}

export async function deleteAction(id: number) {
  await requireAdmin();
  await deleteDraft(id);
  redirect("/app/newsletters");
}
