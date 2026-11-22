"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guard";
import { addSubscriberManually } from "@/lib/subscribers";
import { emailSchema } from "@/lib/validation";

export type AddState = { error?: string; ok?: string };

export async function addSubscriber(_: AddState, form: FormData): Promise<AddState> {
  await requireAdmin();
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Adresse email invalide." };
  const note = String(form.get("note") ?? "").trim();
  if (!note) return { error: "Indiquez comment cette personne a donné son accord (preuve du consentement)." };
  if (form.get("consent") !== "on") return { error: "Cochez la case pour confirmer que la personne a donné son accord." };
  const firstName = String(form.get("firstName") ?? "").trim() || null;
  await addSubscriberManually(email.data, firstName, `ajout manuel : ${note}`.slice(0, 500));
  revalidatePath("/app/abonnes");
  return { ok: `${email.data} est inscrit(e).` };
}
