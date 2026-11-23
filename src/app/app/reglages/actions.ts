"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guard";
import { emailSchema } from "@/lib/validation";
import { getMailSettings, normalizeAppPassword, saveMailSettings, verifyGmail } from "@/lib/settings";

export type GmailState = { error?: string; ok?: string };

export async function saveGmail(_: GmailState, form: FormData): Promise<GmailState> {
  await requireAdmin();
  const address = emailSchema.safeParse(form.get("address"));
  if (!address.success) return { error: "Adresse Gmail invalide." };
  const fromName = String(form.get("fromName") ?? "").trim().slice(0, 100);
  if (!fromName) return { error: "Indiquez le nom affiché comme expéditeur." };
  const typed = normalizeAppPassword(String(form.get("password") ?? ""));
  const current = await getMailSettings();

  // Sans nouveau mot de passe, on garde celui déjà enregistré (s'il existe).
  const password = typed || (current.source === "application" ? current.password : "");
  if (!password) return { error: "Collez le mot de passe d'application de 16 lettres créé dans votre compte Google." };
  if (typed && typed.length !== 16) {
    return { error: `Un mot de passe d'application Google fait 16 lettres (vous en avez saisi ${typed.length}).` };
  }

  const problem = await verifyGmail(address.data, password);
  if (problem) return { error: problem };

  await saveMailSettings({ address: address.data, password: typed || undefined, fromName });
  revalidatePath("/app/reglages");
  revalidatePath("/app");
  return { ok: "Gmail est branché : la connexion a été testée avec succès. Les emails en attente vont partir dans la minute." };
}

export async function toggleDigest(form: FormData) {
  await requireAdmin();
  const { setDigestEnabled } = await import("@/lib/digest");
  await setDigestEnabled(form.get("value") === "on");
  revalidatePath("/app/reglages");
}

/** « M'envoyer l'email du matin maintenant », même s'il n'y a rien d'urgent. */
export async function sendDigestNow(): Promise<void> {
  await requireAdmin();
  const { queueDigest } = await import("@/lib/digest");
  await queueDigest(new Date(), { evenIfEmpty: true });
  revalidatePath("/app/reglages");
  const { redirect } = await import("next/navigation");
  redirect("/app/reglages?matin=envoye#matin");
}
