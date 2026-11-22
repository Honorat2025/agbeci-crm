"use server";

import { unsubscribe } from "@/lib/subscribers";

export type UnsubState = { done?: boolean; error?: string };

export async function unsubscribeAction(_: UnsubState, form: FormData): Promise<UnsubState> {
  const ok = await unsubscribe(String(form.get("t") ?? ""));
  return ok ? { done: true } : { error: "Lien inconnu. Si le problème continue, répondez simplement à un de mes emails." };
}
