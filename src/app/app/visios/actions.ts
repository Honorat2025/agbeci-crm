"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guard";
import { cancelMeeting, DURATIONS, parisToDate, scheduleMeeting } from "@/lib/meetings";

export type FormState = { error?: string; ok?: string };

function refresh(contactId?: number | null, opportunityId?: number | null) {
  revalidatePath("/app");
  revalidatePath("/app/rappels");
  if (contactId) revalidatePath(`/app/contacts/${contactId}`);
  if (opportunityId) revalidatePath(`/app/prospection/${opportunityId}`);
}

export async function planMeeting(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const contactId = Number(form.get("contactId"));
  const opportunityId = Number(form.get("opportunityId")) || null;
  const title = String(form.get("title") ?? "").trim().slice(0, 150);
  const message = String(form.get("message") ?? "").trim().slice(0, 5000);
  const durationMin = Number(form.get("duration"));
  const startsAt = parisToDate(String(form.get("day") ?? ""), String(form.get("time") ?? ""));
  if (!Number.isInteger(contactId)) return { error: "Contact introuvable." };
  if (!title) return { error: "Donnez un objet au rendez-vous." };
  if (!startsAt) return { error: "Choisissez le jour et l'heure." };
  if (startsAt.getTime() < Date.now() - 5 * 60000) return { error: "Cette date est déjà passée." };
  if (!(DURATIONS as readonly number[]).includes(durationMin)) return { error: "Choisissez une durée." };
  try {
    await scheduleMeeting({ contactId, opportunityId, title, startsAt, durationMin, message });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Impossible de planifier la visio." };
  }
  refresh(contactId, opportunityId);
  return { ok: "Visio planifiée : l'invitation part depuis votre Gmail et un rappel est ajouté pour le jour même." };
}

export async function cancelMeetingAction(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  if (Number.isInteger(id)) await cancelMeeting(id);
  refresh(Number(form.get("contactId")) || null, Number(form.get("opportunityId")) || null);
}
