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
  hasEmail = true,
}: {
  contactId: number;
  opportunityId?: number;
  defaultTitle: string;
  defaultDay: string;
  defaultMessage: string;
  durations: readonly number[];
  /** Sans email, rien ne part : Honorat envoie l'invitation par WhatsApp ou LinkedIn. */
  hasEmail?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(planMeeting, {});
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: defaultTitle, day: defaultDay, time: "15:00", duration: "45", message: defaultMessage, provider: "jitsi", link: "" });
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
      <fieldset className="plainset">
        <legend>Outil de visio</legend>
        <label className="choice">
          <input type="radio" name="provider" value="jitsi" checked={v.provider === "jitsi"} onChange={set("provider")} />
          <span><strong>Jitsi Meet</strong> : le lien est créé automatiquement.</span>
        </label>
        <label className="choice">
          <input type="radio" name="provider" value="meet" checked={v.provider === "meet"} onChange={set("provider")} />
          <span><strong>Google Meet</strong> : collez un lien que vous avez créé.</span>
        </label>
        {v.provider === "meet" && (
          <div style={{ marginTop: 8 }}>
            <label htmlFor={id("link")}>Lien Google Meet</label>
            <input id={id("link")} name="link" type="url" placeholder="https://meet.google.com/abc-defg-hij" value={v.link} onChange={set("link")} />
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Pour l&apos;obtenir : ouvrez <a href="https://meet.google.com" target="_blank" rel="noopener noreferrer">meet.google.com</a>, cliquez sur « Nouvelle réunion », puis
              « Créer une réunion pour plus tard », et copiez le lien.
            </p>
          </div>
        )}
      </fieldset>
      <label htmlFor={id("message")}>Message d&apos;invitation</label>
      <textarea id={id("message")} name="message" className="prose short" value={v.message} onChange={set("message")} />
      <p className="muted small">
        {hasEmail
          ? "L'email part depuis votre Gmail avec le jour, l'heure (Paris et GMT), le lien de la visio et un lien pour l'ajouter à l'agenda."
          : "Cette fiche n'a pas d'email : une fois la visio planifiée, envoyez l'invitation avec le bouton WhatsApp ou LinkedIn qui apparaîtra à côté."}{" "}
        Un rappel est ajouté pour le jour même. Le jour J, ouvrez le lien un peu avant l&apos;heure
        {v.provider === "jitsi" ? " : Jitsi vous demandera de vous connecter avec votre compte Google pour ouvrir la salle." : " et acceptez vos invités quand ils demandent à entrer."}
      </p>
      {state.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button className="btn" disabled={pending}>{hasEmail ? "Envoyer l'invitation" : "Planifier la visio"}</button>
        <button type="button" className="linkbtn" onClick={() => setOpen(false)}>Annuler</button>
      </div>
    </form>
  );
}
