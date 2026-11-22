"use client";

import { useActionState, useState } from "react";
import { saveGmail, type GmailState } from "./actions";

export function GmailForm(props: { address: string; fromName: string; hasPassword: boolean }) {
  const [state, action, pending] = useActionState<GmailState, FormData>(saveGmail, {});
  const [address, setAddress] = useState(props.address);
  const [fromName, setFromName] = useState(props.fromName);
  const [password, setPassword] = useState("");
  return (
    <form action={action}>
      <div className="grid2">
        <div>
          <label htmlFor="address">Votre adresse Gmail</label>
          <input id="address" name="address" type="email" required value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <label htmlFor="fromName">Nom affiché comme expéditeur</label>
          <input id="fromName" name="fromName" type="text" required value={fromName} onChange={(e) => setFromName(e.target.value)} />
        </div>
      </div>
      <label htmlFor="password">Mot de passe d&apos;application Google (16 lettres)</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="off"
        placeholder={props.hasPassword ? "Déjà enregistré : laissez vide pour le garder" : "abcd efgh ijkl mnop"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <p className="muted">
        Ce n&apos;est pas votre mot de passe Gmail habituel. Il se crée sur{" "}
        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a>{" "}
        et il est enregistré chiffré. Vous pouvez le supprimer à tout moment depuis votre compte Google.
      </p>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">{state.ok}</p>}
      <p><button className="btn" disabled={pending}>{pending ? "Test de la connexion…" : "Enregistrer et tester"}</button></p>
    </form>
  );
}
