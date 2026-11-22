"use client";

import { useActionState, useState } from "react";
import { finishSetup, startSetup, type FormState } from "./actions";

export function StartForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(startSetup, {});
  const [email, setEmail] = useState("");
  return (
    <form action={action}>
      <label htmlFor="token">Code d&apos;installation</label>
      <input id="token" name="token" type="password" required autoComplete="off" />
      <label htmlFor="email">Votre adresse email</label>
      <input id="email" name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Mot de passe (12 caractères minimum)</label>
      <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" />
      <label htmlFor="password2">Mot de passe, encore une fois</label>
      <input id="password2" name="password2" type="password" required minLength={12} autoComplete="new-password" />
      {state.error && <p className="error">{state.error}</p>}
      <p><button className="btn" disabled={pending}>Continuer</button></p>
    </form>
  );
}

export function CodeForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(finishSetup, {});
  return (
    <form action={action}>
      <label htmlFor="code">Code à 6 chiffres affiché dans l&apos;application</label>
      <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required />
      {state.error && <p className="error">{state.error}</p>}
      <p><button className="btn" disabled={pending}>Terminer l&apos;installation</button></p>
    </form>
  );
}
