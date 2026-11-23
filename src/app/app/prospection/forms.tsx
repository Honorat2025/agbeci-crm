"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveOpportunity, saveTask, sendBulk, type FormState } from "./actions";

type Change = React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
type Option = { value: string; label: string };

export type OpportunityFields = {
  id: number | null;
  title: string;
  kind: string;
  stage: string;
  contactId: string;
  organization: string;
  country: string;
  amount: string;
  currency: string;
  source: string;
  notes: string;
};

export function OpportunityForm({
  initial,
  kinds,
  stages,
  currencies,
  contacts,
  firstTaskDue,
}: {
  initial: OpportunityFields;
  kinds: Option[];
  stages: Option[];
  currencies: readonly string[];
  contacts: Option[];
  /** Présent pour une nouvelle affaire : propose une première action datée. */
  firstTaskDue?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveOpportunity, {});
  const [v, setV] = useState(initial);
  const [firstTask, setFirstTask] = useState("");
  const [firstDue, setFirstDue] = useState(firstTaskDue ?? "");
  const bind = (k: Exclude<keyof OpportunityFields, "id">) => ({
    id: `o-${k}`,
    name: k,
    value: v[k],
    onChange: (e: Change) => setV({ ...v, [k]: e.target.value }),
  });
  return (
    <form action={action}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <label htmlFor="o-title">Titre</label>
      <input type="text" required placeholder="Ex. : Mission d'évaluation, ministère de la Santé" {...bind("title")} />
      <div className="grid2">
        <div>
          <label htmlFor="o-kind">Type</label>
          <select {...bind("kind")}>{kinds.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </div>
        <div>
          <label htmlFor="o-stage">Étape</label>
          <select {...bind("stage")}>{stages.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </div>
        <div>
          <label htmlFor="o-contactId">Contact</label>
          <select {...bind("contactId")}>
            <option value="">(aucun)</option>
            {contacts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div><label htmlFor="o-organization">Organisation</label><input type="text" placeholder="Entreprise, ONG, ministère…" {...bind("organization")} /></div>
        <div><label htmlFor="o-country">Pays</label><input type="text" placeholder="Ex. : Côte d'Ivoire" {...bind("country")} /></div>
        <div><label htmlFor="o-source">Origine</label><input type="text" placeholder="Ex. : site, recommandation, LinkedIn" {...bind("source")} /></div>
        <div><label htmlFor="o-amount">Montant estimé (facultatif)</label><input type="text" inputMode="numeric" placeholder="Ex. : 5000" {...bind("amount")} /></div>
        <div>
          <label htmlFor="o-currency">Devise</label>
          <select {...bind("currency")}>{currencies.map((c) => <option key={c} value={c}>{c === "XOF" ? "XOF (F CFA UEMOA)" : c === "XAF" ? "XAF (F CFA CEMAC)" : c}</option>)}</select>
        </div>
      </div>
      <label htmlFor="o-notes">Notes</label>
      <textarea className="prose short" placeholder="Besoin, interlocuteurs, prochaines étapes…" {...bind("notes")} />
      {firstTaskDue !== undefined && (
        <div className="grid2">
          <div><label htmlFor="o-firstTask">Prochaine action (facultatif)</label><input id="o-firstTask" name="firstTask" type="text" placeholder="Ex. : Envoyer la proposition" value={firstTask} onChange={(e) => setFirstTask(e.target.value)} /></div>
          <div><label htmlFor="o-firstDue">Pour le</label><input id="o-firstDue" name="firstDue" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} /></div>
        </div>
      )}
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">{state.ok}</p>}
      <p><button className="btn" disabled={pending}>{v.id ? "Enregistrer" : "Créer l'affaire"}</button></p>
    </form>
  );
}

export function TaskForm({
  defaultDue,
  contactId,
  opportunityId,
  contacts,
}: {
  defaultDue: string;
  contactId?: number;
  opportunityId?: number;
  /** Sur la page Rappels : choix libre du contact. */
  contacts?: Option[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTask, {});
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(defaultDue);
  const [who, setWho] = useState("");
  useEffect(() => {
    if (state.ok) setTitle("");
  }, [state]);
  return (
    <form action={action}>
      {contactId && <input type="hidden" name="contactId" value={contactId} />}
      {opportunityId && <input type="hidden" name="opportunityId" value={opportunityId} />}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: "2 1 240px" }}>
          <label htmlFor={`t-title-${opportunityId ?? contactId ?? 0}`}>Nouveau rappel</label>
          <input id={`t-title-${opportunityId ?? contactId ?? 0}`} name="title" type="text" placeholder="Ex. : Relancer par téléphone" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {contacts && (
          <div style={{ flex: "1 1 180px" }}>
            <label htmlFor="t-contact">Contact (facultatif)</label>
            <select id="t-contact" name="contactId" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">(aucun)</option>
              {contacts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <div style={{ flex: "0 1 170px" }}>
          <label htmlFor={`t-due-${opportunityId ?? contactId ?? 0}`}>Pour le</label>
          <input id={`t-due-${opportunityId ?? contactId ?? 0}`} name="dueOn" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div><button className="btn secondary" disabled={pending || !title.trim()}>Ajouter</button></div>
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}

export function BulkForm({ tags }: { tags: { tag: string; n: number }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendBulk, {});
  const [tag, setTag] = useState(tags[0]?.tag ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Bonjour {prenom},\n\n\n\nBien cordialement,\nDr Honorat AGBECI");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (state.ok) {
      setSubject("");
      setConfirm(false);
    }
  }, [state]);
  const preview = useMemo(
    () =>
      body
        .replace(/\{\s*pr[ée]nom\s*\}/gi, "Awa")
        .replace(/\{\s*nom\s*\}/gi, "Koné")
        .replace(/\{\s*organisation\s*\}/gi, "Clinique du Plateau"),
    [body],
  );
  if (!tags.length) {
    return <p className="muted">Ajoutez d&apos;abord des étiquettes à vos contacts (ex. « prospect », « ong », « cote-d-ivoire ») : l&apos;envoi groupé se fait par étiquette.</p>;
  }
  return (
    <form action={action}>
      <div className="grid2">
        <div>
          <label htmlFor="b-tag">Destinataires : contacts avec l&apos;étiquette</label>
          <select id="b-tag" name="tag" value={tag} onChange={(e) => setTag(e.target.value)}>
            {tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.n})</option>)}
          </select>
        </div>
        <div><label htmlFor="b-subject">Objet</label><input id="b-subject" name="subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      </div>
      <label htmlFor="b-body">Message</label>
      <textarea id="b-body" name="body" className="prose" value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="muted small">
        Écrivez <code>{"{prenom}"}</code>, <code>{"{nom}"}</code> ou <code>{"{organisation}"}</code> : chaque personne reçoit un email à son nom, envoyé depuis votre Gmail, comme si vous l&apos;aviez écrit à la main.
      </p>
      <details>
        <summary>Aperçu pour « Awa Koné, Clinique du Plateau »</summary>
        <div className="note plain">{preview}{"\n\n"}Si vous préférez ne plus recevoir ce type de message, répondez simplement « stop ».</div>
      </details>
      <p>
        <label className="row" style={{ fontWeight: "normal" }}>
          <input type="checkbox" name="confirm" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} style={{ width: "auto" }} />
          J&apos;ai relu le message et je veux l&apos;envoyer à tous les contacts « {tag} ».
        </label>
      </p>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">{state.ok}</p>}
      <p><button className="btn" disabled={pending || !confirm || !subject.trim()}>Envoyer</button></p>
    </form>
  );
}
