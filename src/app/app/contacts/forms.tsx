"use client";

import { useActionState, useEffect, useState } from "react";
import { createContact, importCsv, saveContact, saveNote, type FormState } from "./actions";

type Change = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

export type ContactFields = {
  id: number;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  phone: string;
  country: string;
  tags: string;
  email: string;
  hasEmail: boolean;
  linkedinUrl: string;
};

export function ContactForm({ initial }: { initial: ContactFields }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveContact, {});
  const [v, setV] = useState(initial);
  const bind = (k: Exclude<keyof ContactFields, "id" | "hasEmail">) => ({
    id: k,
    name: k,
    value: v[k],
    onChange: (e: Change) => setV({ ...v, [k]: e.target.value }),
  });
  return (
    <form action={action}>
      <input type="hidden" name="id" value={v.id} />
      <div className="grid2">
        <div><label htmlFor="firstName">Prénom</label><input type="text" {...bind("firstName")} /></div>
        <div><label htmlFor="lastName">Nom</label><input type="text" {...bind("lastName")} /></div>
        <div><label htmlFor="company">Organisation</label><input type="text" {...bind("company")} /></div>
        <div><label htmlFor="jobTitle">Fonction</label><input type="text" {...bind("jobTitle")} /></div>
        <div><label htmlFor="phone">Téléphone</label><input type="text" {...bind("phone")} /></div>
        <div><label htmlFor="country">Pays</label><input type="text" {...bind("country")} /></div>
        {!v.hasEmail && <div><label htmlFor="email">Email</label><input type="email" {...bind("email")} /></div>}
        <div><label htmlFor="linkedinUrl">Profil LinkedIn</label><input type="url" placeholder="https://www.linkedin.com/in/…" {...bind("linkedinUrl")} /></div>
      </div>
      <label htmlFor="tags">Étiquettes (séparées par des virgules)</label>
      <input type="text" placeholder="ex. client, consultation, côte d'ivoire" {...bind("tags")} />
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">{state.ok}</p>}
      <p><button className="btn" disabled={pending}>Enregistrer</button></p>
    </form>
  );
}

export function NoteForm({ contactId }: { contactId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveNote, {});
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState("note");
  useEffect(() => {
    if (state.ok) setBody("");
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="contactId" value={contactId} />
      <fieldset className="plainset row" style={{ gap: 16 }}>
        <legend>Nouvelle note</legend>
        {([["note", "Note"], ["whatsapp", "Échange WhatsApp"], ["linkedin", "Échange LinkedIn"], ["appel", "Appel téléphonique"]] as const).map(([k, l]) => (
          <label key={k} className="choice" style={{ margin: 0 }}>
            <input type="radio" name="channel" value={k} checked={channel === k} onChange={() => setChannel(k)} /> <span>{l}</span>
          </label>
        ))}
      </fieldset>
      <textarea id="note" aria-label="Texte de la note" name="body" className="prose short" value={body} onChange={(e) => setBody(e.target.value)}
        placeholder={channel === "whatsapp" ? "Ex. : d'accord pour une visio la semaine prochaine, m'envoie son CV." : "Ex. : appel le 22/11, intéressé par une consultation en avril."} />
      {state.error && <p className="error">{state.error}</p>}
      <p><button className="btn secondary" disabled={pending || !body.trim()}>Ajouter la note</button></p>
    </form>
  );
}

export function NewContactForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createContact, {});
  const [v, setV] = useState({ email: "", phone: "", linkedinUrl: "", firstName: "", lastName: "", company: "" });
  const bind = (k: keyof typeof v) => ({ id: `n-${k}`, name: k, value: v[k], onChange: (e: Change) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form action={action}>
      <div className="grid2">
        <div><label htmlFor="n-firstName">Prénom</label><input type="text" {...bind("firstName")} /></div>
        <div><label htmlFor="n-lastName">Nom</label><input type="text" {...bind("lastName")} /></div>
        <div><label htmlFor="n-email">Email</label><input type="email" {...bind("email")} /></div>
        <div><label htmlFor="n-phone">Téléphone</label><input type="tel" placeholder="+225 07 12 34 56 78" {...bind("phone")} /></div>
        <div><label htmlFor="n-linkedinUrl">Profil LinkedIn</label><input type="url" placeholder="https://www.linkedin.com/in/…" {...bind("linkedinUrl")} /></div>
        <div><label htmlFor="n-company">Organisation</label><input type="text" {...bind("company")} /></div>
      </div>
      <p className="muted small">Indiquez au moins un email, un téléphone ou un profil LinkedIn.</p>
      {state.error && <p className="error">{state.error}</p>}
      <p><button className="btn" disabled={pending}>Créer la fiche</button></p>
    </form>
  );
}

export function ImportForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(importCsv, {});
  return (
    <form action={action}>
      <label htmlFor="file">Fichier CSV</label>
      <input id="file" name="file" type="file" accept=".csv,text/csv" required />
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">{state.ok}</p>}
      <p><button className="btn" disabled={pending}>{pending ? "Import en cours…" : "Importer"}</button></p>
    </form>
  );
}
