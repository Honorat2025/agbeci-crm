"use client";

import { useActionState, useState } from "react";
import type { EditState } from "./actions";

type Action = (state: EditState, form: FormData) => Promise<EditState>;

export function NewsletterEditor({
  action,
  initial,
  submitLabel,
}: {
  action: Action;
  initial?: { subject: string; preheader: string | null; bodyMarkdown: string };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<EditState, FormData>(action, {});
  // Champs contrôlés : rien n'est perdu si l'enregistrement échoue.
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [preheader, setPreheader] = useState(initial?.preheader ?? "");
  const [body, setBody] = useState(initial?.bodyMarkdown ?? "");
  return (
    <form action={formAction}>
      <label htmlFor="subject">Objet</label>
      <input id="subject" name="subject" type="text" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <label htmlFor="preheader">Phrase d&apos;accroche (affichée après l&apos;objet dans la boîte mail)</label>
      <input id="preheader" name="preheader" type="text" maxLength={200} value={preheader} onChange={(e) => setPreheader(e.target.value)} />
      <label htmlFor="bodyMarkdown">Texte</label>
      <p className="muted" style={{ margin: "0 0 6px" }}>
        Mise en forme simple : **gras**, *italique*, [texte du lien](https://...), une ligne vide entre deux
        paragraphes, « - » en début de ligne pour une liste.
      </p>
      <textarea id="bodyMarkdown" name="bodyMarkdown" value={body} onChange={(e) => setBody(e.target.value)} />
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">{state.ok}</p>}
      <p><button className="btn" disabled={pending}>{submitLabel}</button></p>
    </form>
  );
}

export function SmallForm({
  action,
  children,
  button,
  danger,
}: {
  action: Action;
  children?: React.ReactNode;
  button: string;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState<EditState, FormData>(action, {});
  return (
    <form action={formAction}>
      {children}
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">{state.ok}</p>}
      <p><button className={danger ? "btn danger" : "btn secondary"} disabled={pending}>{button}</button></p>
    </form>
  );
}
