"use server";

import { confirmSubscription } from "@/lib/subscribers";

export type ConfirmState = { done?: boolean; error?: string };

export async function confirmAction(_: ConfirmState, form: FormData): Promise<ConfirmState> {
  const ok = await confirmSubscription(String(form.get("t") ?? ""));
  return ok ? { done: true } : { error: "Ce lien n'est plus valable. Inscrivez-vous à nouveau depuis le site." };
}
