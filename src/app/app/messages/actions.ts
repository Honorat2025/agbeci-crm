"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { requestSync } from "@/lib/mailbox";
import { queueNewMessage, queueReply } from "@/lib/messages";
import { emailSchema } from "@/lib/validation";

export type SendState = { error?: string; ok?: string };

/** Accepte « a@x.fr, b@y.fr » ; retourne null si une adresse est invalide. */
function parseCc(value: string): string | null | false {
  const list = value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return null;
  const parsed = list.map((a) => emailSchema.safeParse(a));
  if (parsed.some((p) => !p.success)) return false;
  return parsed.map((p) => p.data).join(", ");
}

export async function sendReply(_: SendState, form: FormData): Promise<SendState> {
  await requireAdmin();
  const threadId = String(form.get("threadId") ?? "");
  const to = emailSchema.safeParse(form.get("to"));
  if (!to.success) return { error: "L'adresse du destinataire est invalide." };
  const cc = parseCc(String(form.get("cc") ?? ""));
  if (cc === false) return { error: "Une adresse en copie est invalide." };
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Le message est vide." };
  if (body.length > 50_000) return { error: "Le message est trop long." };
  await queueReply({ threadId, to: to.data, cc, body });
  revalidatePath(`/app/messages/${threadId}`);
  return { ok: "Réponse en cours d'envoi. Elle partira depuis votre Gmail dans quelques secondes." };
}

export async function sendNew(_: SendState, form: FormData): Promise<SendState> {
  await requireAdmin();
  const to = emailSchema.safeParse(form.get("to"));
  if (!to.success) return { error: "L'adresse du destinataire est invalide." };
  const cc = parseCc(String(form.get("cc") ?? ""));
  if (cc === false) return { error: "Une adresse en copie est invalide." };
  const subject = String(form.get("subject") ?? "").trim();
  if (!subject) return { error: "L'objet est obligatoire." };
  if (subject.length > 300) return { error: "L'objet est trop long." };
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Le message est vide." };
  if (body.length > 50_000) return { error: "Le message est trop long." };
  await queueNewMessage({ to: to.data, cc, subject, body });
  redirect("/app/messages?envoye=1");
}

export async function refreshMailbox() {
  await requireAdmin();
  await requestSync();
  revalidatePath("/app/messages");
}
