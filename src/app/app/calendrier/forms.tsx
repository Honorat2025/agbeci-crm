"use client";

import { useActionState, useState } from "react";
import { saveEvent, type FormState } from "./actions";

type Option = { value: string; label: string };
export type EventFields = { id: number | null; title: string; conversation: string; day: string; time: string; allDay: boolean; duration: string; place: string; notes: string; contactId: string };

const durationLabel = (d: number) => (d < 60 ? `${d} min` : d % 60 === 0 ? `${d / 60} h` : `${Math.floor(d / 60)} h ${d % 60}`);

export function EventForm({ initial, contacts, durations }: { initial: EventFields; contacts: Option[]; durations: readonly number[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveEvent, {});
  const [v, setV] = useState(initial);
  const set = (k: keyof EventFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV({ ...v, [k]: e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form action={action}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {v.conversation && <input type="hidden" name="conversation" value={v.conversation} />}
      {state.error && <p className="error">{state.error}</p>}
      <label htmlFor="ev-title">Titre</label>
      <input id="ev-title" name="title" type="text" required maxLength={150} placeholder="Ex. : Conférence à Abidjan, rendez-vous banque…" value={v.title} onChange={set("title")} />
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}><label htmlFor="ev-day">Jour</label><input id="ev-day" name="day" type="date" required value={v.day} onChange={set("day")} /></div>
        {!v.allDay && (
          <>
            <div style={{ flex: "1 1 120px" }}><label htmlFor="ev-time">Heure (Paris)</label><input id="ev-time" name="time" type="time" step={300} value={v.time} onChange={set("time")} /></div>
            <div style={{ flex: "1 1 120px" }}>
              <label htmlFor="ev-duration">Durée</label>
              <select id="ev-duration" name="duration" value={v.duration} onChange={set("duration")}>
                {durations.map((d) => <option key={d} value={d}>{durationLabel(d)}</option>)}
              </select>
            </div>
          </>
        )}
      </div>
      <label className="choice" style={{ marginTop: 8 }}>
        <input type="checkbox" name="allDay" checked={v.allDay} onChange={set("allDay")} />
        <span>Toute la journée</span>
      </label>
      <label htmlFor="ev-place">Lieu (facultatif)</label>
      <input id="ev-place" name="place" type="text" maxLength={200} value={v.place} onChange={set("place")} />
      <label htmlFor="ev-contact">Avec un contact (facultatif)</label>
      <select id="ev-contact" name="contactId" value={v.contactId} onChange={set("contactId")}>
        <option value="">Aucun</option>
        {contacts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <label htmlFor="ev-notes">Notes (facultatif)</label>
      <textarea id="ev-notes" name="notes" className="prose short" value={v.notes} onChange={set("notes")} />
      <p><button className="btn" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button></p>
    </form>
  );
}
