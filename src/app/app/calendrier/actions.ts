"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { createEvent, deleteEvent, parseEventInput, resetCalendarToken, updateEvent } from "@/lib/calendar";

export type FormState = { error?: string };

export async function saveEvent(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = Number(form.get("id")) || null;
  const day = String(form.get("day") ?? "");
  const parsed = parseEventInput({
    title: String(form.get("title") ?? ""),
    day,
    time: String(form.get("time") ?? ""),
    allDay: form.get("allDay") === "on",
    durationMin: Number(form.get("duration")),
    place: String(form.get("place") ?? ""),
    notes: String(form.get("notes") ?? ""),
    contactId: Number(form.get("contactId")) || null,
    mailThreadId: String(form.get("conversation") ?? ""),
  });
  if ("error" in parsed) return { error: parsed.error };
  if (id) await updateEvent(id, parsed.values);
  else await createEvent(parsed.values);
  revalidatePath("/app");
  revalidatePath("/app/calendrier");
  redirect(`/app/calendrier?mois=${day.slice(0, 7)}&jour=${day}`);
}

export async function removeEvent(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const month = String(form.get("month") ?? "");
  if (Number.isInteger(id)) await deleteEvent(id);
  revalidatePath("/app/calendrier");
  redirect(/^\d{4}-\d{2}$/.test(month) ? `/app/calendrier?mois=${month}` : "/app/calendrier");
}

export async function newFeedLink() {
  await requireAdmin();
  await resetCalendarToken();
  revalidatePath("/app/calendrier");
  redirect("/app/calendrier?lien=nouveau#agenda");
}
