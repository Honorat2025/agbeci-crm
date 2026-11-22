"use client";

import { useActionState } from "react";
import { confirmAction, type ConfirmState } from "./actions";

export function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmAction, {});
  if (state.done) {
    return (
      <>
        <h1>Inscription confirmée</h1>
        <p className="success">Merci ! Un email de bienvenue est en route.</p>
        <p><a href="https://honoratagbeci.com">Retour au site</a></p>
      </>
    );
  }
  return (
    <form action={action}>
      <h1>Confirmer votre inscription</h1>
      <p>Cliquez sur le bouton pour recevoir la newsletter d&apos;Honorat AGBECI.</p>
      <input type="hidden" name="t" value={token} />
      {state.error && <p className="error">{state.error}</p>}
      <p><button className="btn" disabled={pending}>Je confirme</button></p>
    </form>
  );
}
