"use client";

import { useActionState, useEffect, useState } from "react";
import { sendNew, sendReply, type SendState } from "./actions";

type Change = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>;

export function ReplyForm({ threadId, to, cc }: { threadId: string; to: string; cc: string }) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendReply, {});
  const [v, setV] = useState({ to, cc, body: "" });
  const [showCc, setShowCc] = useState(Boolean(cc));
  const bind = (k: keyof typeof v) => ({ value: v[k], onChange: (e: Change) => setV({ ...v, [k]: e.target.value }) });
  // Une fois la réponse partie, on vide la zone de texte.
  useEffect(() => {
    if (state.ok) setV((old) => ({ ...old, body: "" }));
  }, [state]);
  return (
    <form action={action} className="card">
      <h2 style={{ marginTop: 0 }}>Répondre</h2>
      <input type="hidden" name="threadId" value={threadId} />
      <label htmlFor="to">À</label>
      <input id="to" name="to" type="email" required {...bind("to")} />
      {showCc ? (
        <>
          <label htmlFor="cc">Copie (facultatif, adresses séparées par des virgules)</label>
          <input id="cc" name="cc" type="text" {...bind("cc")} />
        </>
      ) : (
        <p><button type="button" className="linkbtn" onClick={() => setShowCc(true)}>Ajouter une copie</button></p>
      )}
      <label htmlFor="body">Message</label>
      <textarea id="body" name="body" className="prose" required {...bind("body")} placeholder="Bonjour," />
      <p className="muted small">Le message précédent sera cité automatiquement sous votre réponse.</p>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">{state.ok}</p>}
      <p><button className="btn" disabled={pending}>{pending ? "Envoi…" : "Envoyer"}</button></p>
    </form>
  );
}

export function NewMessageForm({ to }: { to: string }) {
  const [state, action, pending] = useActionState<SendState, FormData>(sendNew, {});
  const [v, setV] = useState({ to, cc: "", subject: "", body: "" });
  const bind = (k: keyof typeof v) => ({ value: v[k], onChange: (e: Change) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form action={action} className="card">
      <label htmlFor="to">À</label>
      <input id="to" name="to" type="email" required {...bind("to")} />
      <label htmlFor="cc">Copie (facultatif, adresses séparées par des virgules)</label>
      <input id="cc" name="cc" type="text" {...bind("cc")} />
      <label htmlFor="subject">Objet</label>
      <input id="subject" name="subject" type="text" required {...bind("subject")} />
      <label htmlFor="body">Message</label>
      <textarea id="body" name="body" className="prose" required {...bind("body")} placeholder="Bonjour," />
      {state.error && <p className="error">{state.error}</p>}
      <p><button className="btn" disabled={pending}>{pending ? "Envoi…" : "Envoyer"}</button></p>
    </form>
  );
}
