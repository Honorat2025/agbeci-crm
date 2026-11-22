"use client";

import { useActionState, useState } from "react";
import { loginCode, loginPassword, type LoginState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginPassword, {});
  // Champ contrôlé : React vide les formulaires après chaque envoi, on garde l'email saisi.
  const [email, setEmail] = useState("");
  return (
    <form action={action}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Mot de passe</label>
      <input id="password" name="password" type="password" required autoComplete="current-password" />
      {state.error && <p className="error">{state.error}</p>}
      <p><button className="btn" disabled={pending}>Continuer</button></p>
    </form>
  );
}

export function CodeForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginCode, {});
  return (
    <form action={action}>
      <label htmlFor="code">Code à 6 chiffres de votre application d&apos;authentification</label>
      <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" required autoFocus />
      {state.error && <p className="error">{state.error}</p>}
      <p><button className="btn" disabled={pending}>Se connecter</button></p>
    </form>
  );
}
