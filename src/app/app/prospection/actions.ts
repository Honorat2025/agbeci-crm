"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import {
  addTask,
  createOpportunity,
  CURRENCIES,
  deleteOpportunity,
  deleteTask,
  isDay,
  isKind,
  isStage,
  moveOpportunity,
  postponeTask,
  queueBulk,
  setNoBulk,
  setTaskDone,
  updateOpportunity,
  type OpportunityInput,
} from "@/lib/prospection";

export type FormState = { error?: string; ok?: string };

const clean = (v: FormDataEntryValue | null, max = 200) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};
const intOrNull = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[\s .]/g, "").replace(",", "."));
  return String(v ?? "").trim() && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

function refreshAll(contactId?: number | null, opportunityId?: number | null) {
  revalidatePath("/app");
  revalidatePath("/app/prospection");
  revalidatePath("/app/rappels");
  if (contactId) revalidatePath(`/app/contacts/${contactId}`);
  if (opportunityId) revalidatePath(`/app/prospection/${opportunityId}`);
}

function readOpportunity(form: FormData): OpportunityInput | string {
  const title = clean(form.get("title"), 200);
  if (!title) return "Donnez un titre à l'affaire.";
  const kind = form.get("kind");
  const stage = form.get("stage");
  if (!isKind(kind)) return "Choisissez un type.";
  if (!isStage(stage)) return "Choisissez une étape.";
  const currency = String(form.get("currency") ?? "EUR");
  const contactId = Number(form.get("contactId")) || null;
  return {
    title,
    kind,
    stage,
    contactId,
    organization: clean(form.get("organization")),
    country: clean(form.get("country"), 80),
    amount: intOrNull(form.get("amount")),
    currency: (CURRENCIES as readonly string[]).includes(currency) ? currency : "EUR",
    source: clean(form.get("source")),
    notes: String(form.get("notes") ?? "").trim().slice(0, 10_000),
  };
}

export async function saveOpportunity(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const input = readOpportunity(form);
  if (typeof input === "string") return { error: input };
  const id = Number(form.get("id")) || null;
  if (id) {
    await updateOpportunity(id, input);
    refreshAll(input.contactId, id);
    return { ok: "Affaire enregistrée." };
  }
  const newId = await createOpportunity(input);
  const firstStep = clean(form.get("firstTask"), 300);
  const firstDue = form.get("firstDue");
  if (firstStep && isDay(firstDue)) await addTask({ title: firstStep, dueOn: firstDue, opportunityId: newId });
  refreshAll(input.contactId, newId);
  redirect(`/app/prospection/${newId}`);
}

export async function changeStage(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const stage = form.get("stage");
  if (Number.isInteger(id) && isStage(stage)) await moveOpportunity(id, stage);
  refreshAll(null, id);
}

export async function removeOpportunity(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  if (Number.isInteger(id)) await deleteOpportunity(id);
  refreshAll();
  redirect("/app/prospection");
}

export async function saveTask(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const title = clean(form.get("title"), 300);
  const dueOn = form.get("dueOn");
  if (!title) return { error: "Écrivez ce qu'il faut faire." };
  if (!isDay(dueOn)) return { error: "Choisissez une date." };
  const contactId = Number(form.get("contactId")) || null;
  const opportunityId = Number(form.get("opportunityId")) || null;
  await addTask({ title, dueOn, contactId, opportunityId });
  refreshAll(contactId, opportunityId);
  return { ok: "Rappel ajouté." };
}

/** Boutons d'une ligne de rappel : fait, reporter, supprimer. */
export async function taskAction(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const what = String(form.get("do"));
  if (what === "done") await setTaskDone(id, true);
  else if (what === "undo") await setTaskDone(id, false);
  else if (what === "+1") await postponeTask(id, 1);
  else if (what === "+7") await postponeTask(id, 7);
  else if (what === "delete") await deleteTask(id);
  refreshAll(Number(form.get("contactId")) || null, Number(form.get("opportunityId")) || null);
}

export async function sendBulk(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const tag = clean(form.get("tag"), 100);
  const subject = clean(form.get("subject"), 200);
  const body = String(form.get("body") ?? "").trim().slice(0, 20_000);
  if (!tag) return { error: "Choisissez une étiquette." };
  if (!subject) return { error: "L'objet est vide." };
  if (!body) return { error: "Le message est vide." };
  if (form.get("confirm") !== "on") return { error: "Cochez la case de confirmation avant d'envoyer." };
  try {
    const { count, quota } = await queueBulk({ tag, subject, body });
    revalidatePath("/app/envois");
    const later = count > quota ? ` Le quota du jour permet ${quota} envoi(s) : le reste partira automatiquement les jours suivants.` : "";
    return { ok: `${count} email(s) personnalisés mis en file d'envoi.${later}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Envoi impossible." };
  }
}

export async function toggleNoBulk(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("contactId"));
  if (Number.isInteger(id)) await setNoBulk(id, form.get("value") === "1");
  revalidatePath(`/app/contacts/${id}`);
}
