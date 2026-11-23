"use client";

import { useActionState, useEffect, useState } from "react";
import { planMeeting, type FormState } from "./actions";

export function MeetingForm({
  contactId,
  opportunityId,
  defaultTitle,
  defaultDay,
  defaultMessage,
  durations,
}: {
  contactId: number;
  opportunityId?: number;
  defaultTitle: string;
  defaultDay: string;
  defaultMessage: string;
  durations: readonly number[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(planMeeting, {});
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: defaultTitle, day: defaultDay, time: "15:00", duration: "45", message: defaultMessage });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);
  const id = (k: string) => `v-${k}-${opportunityId ?? contactId}`;
  if (!open) {
    return (
      <>
        {state.ok && <p className="success">{state.ok}</p>}
        <p style={{ margin: 0 }}><button type="button" className="btn secondary" onClick={() => setOpen(true)}>Planifier une visio</button></p>
      </>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="contactId" value={contactId} />
      {opportunityId && <input type="hidden" name="opportunityId" value={opportunityId} />}
      <label htmlFor={id("title")}>Objet</label>
      <input id={id("title")} name="title" type="text" value={v.title} onChange={set("title")} />
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}><label htmlFor={id("day")}>Jour</label><input id={id("day")} name="day" type="date" value={v.day} onChange={set("day")} /></div>
        <div style={{ flex: "1 1 120px" }}><label htmlFor={id("time")}>Heure (Paris)</label><input id={id("time")} name="time" type="time" step={300} value={v.time} onChange={set("time")} /></div>
        <div style={{ flex: "1 1 120px" }}>
          <label htmlFor={id("duration")}>Durée</label>
          <select id={id("duration")} name="duration" value={v.duration} onChange={set("duration")}>
            {durations.map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : d === 60 ? "1 h" : "1 h 30"}</option>)}
          </select>
        </div>
      </div>
      <label htmlFor={id("message")}>Message d&apos;invitation</label>
      <textarea id={id("message")} name="message" className="prose short" value={v.message} onChange={set("message")} />
      <p className="muted small">
        L&apos;email part depuis votre Gmail avec le jour, l&apos;heure (Paris et GMT), le lien de la visio et un lien pour l&apos;ajouter à l&apos;agenda.
        Un rappel est ajouté pour le jour même. Le jour J, ouvrez le lien un peu avant l&apos;heure : Jitsi vous demandera de vous connecter avec votre compte Google pour ouvrir la salle.
      </p>
      {state.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button className="btn" disabled={pending}>Envoyer l&apos;invitation</button>
        <button type="button" className="linkbtn" onClick={() => setOpen(false)}>Annuler</button>
      </div>
    </form>
  );
}
