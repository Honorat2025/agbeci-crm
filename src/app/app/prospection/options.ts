import { contactLabel, listContacts } from "@/lib/contacts";
import { CURRENCIES, KIND_LABELS, STAGE_LABELS, type Kind, type Stage } from "@/lib/prospection";

export const kindOptions = (Object.keys(KIND_LABELS) as Kind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }));
export const stageOptions = (Object.keys(STAGE_LABELS) as Stage[]).map((s) => ({ value: s, label: STAGE_LABELS[s] }));
export { CURRENCIES };

/** Contacts pour les listes déroulantes, triés par nom. */
export async function contactOptions() {
  const rows = await listContacts();
  return rows
    .map((c) => {
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
      const extra = c.email ?? c.phone;
      return { value: String(c.id), label: name && extra ? `${name} (${extra})` : contactLabel(c) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}
