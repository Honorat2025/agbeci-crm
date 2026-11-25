"use client";

import Link from "next/link";
import { useState } from "react";
import { trashConversations } from "./actions";

export type ThreadRow = { threadId: string; who: string; count: number; subject: string; snippet: string; when: string; unseen: boolean };

/** Liste des conversations, avec cases à cocher pour en mettre plusieurs à la corbeille. */
export function ThreadList({ rows, folder }: { rows: ThreadRow[]; folder: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const toggle = (id: string) => {
    setConfirm(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const all = picked.length === rows.length;
  return (
    <form action={trashConversations}>
      <input type="hidden" name="dossier" value={folder} />
      {picked.map((id) => <input key={id} type="hidden" name="thread" value={id} />)}
      <div className="thread-tools row">
        <label className="choice" style={{ margin: 0 }}>
          <input type="checkbox" checked={all} onChange={() => { setConfirm(false); setPicked(all ? [] : rows.map((r) => r.threadId)); }} aria-label="Tout sélectionner" />
          <span>{picked.length ? `${picked.length} sélectionnée(s)` : "Tout sélectionner"}</span>
        </label>
        {picked.length > 0 && !confirm && (
          <button type="button" className="btn secondary danger" onClick={() => setConfirm(true)}>🗑 Mettre à la corbeille</button>
        )}
        {picked.length > 0 && confirm && (
          <>
            <button className="btn danger">Oui, mettre {picked.length} conversation(s) à la corbeille</button>
            <button type="button" className="linkbtn" onClick={() => setConfirm(false)}>Annuler</button>
          </>
        )}
      </div>
      <div className="card threads">
        <ul>
          {rows.map((t) => (
            <li key={t.threadId} className={[t.unseen && "unseen", picked.includes(t.threadId) && "picked"].filter(Boolean).join(" ") || undefined}>
              <input type="checkbox" className="pick" checked={picked.includes(t.threadId)} onChange={() => toggle(t.threadId)} aria-label={`Sélectionner « ${t.subject} »`} />
              <Link prefetch={false} href={`/app/messages/${encodeURIComponent(t.threadId)}`}>
                <span className="who">
                  {t.who}
                  {t.count > 1 && <span className="muted"> ({t.count})</span>}
                </span>
                <span className="what">
                  <strong>{t.subject}</strong>
                  <span className="muted"> — {t.snippet}</span>
                </span>
                <span className="when muted">{t.when}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}

/** Bouton de la page d'une conversation, avec confirmation. */
export function TrashThreadButton({ threadId }: { threadId: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <form action={trashConversations} className="row" style={{ display: "inline-flex" }}>
      <input type="hidden" name="thread" value={threadId} />
      {!confirm ? (
        <button type="button" className="btn secondary danger" onClick={() => setConfirm(true)}>🗑 Supprimer</button>
      ) : (
        <>
          <button className="btn danger">Oui, mettre à la corbeille</button>
          <button type="button" className="linkbtn" onClick={() => setConfirm(false)}>Annuler</button>
        </>
      )}
    </form>
  );
}
