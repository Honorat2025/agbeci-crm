"use client";

import { useActionState } from "react";
import { unsubscribeAction, type UnsubState } from "./actions";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<UnsubState, FormData>(unsubscribeAction, {});
  if (state.done) {
    return (
      <>
        <h1>Vous êtes désinscrit(e)</h1>
        <p>Vous ne recevrez plus la newsletter. Merci de l&apos;avoir lue jusqu&apos;ici.</p>
      </>
    );
  }
  return (
    <form action={action}>
      <h1>Se désinscrire</h1>
      <p>Vous ne recevrez plus la newsletter d&apos;Honorat AGBECI.</p>
      <input type="hidden" name="t" value={token} />
      {state.error && <p className="error">{state.error}</p>}
      <p><button className="btn" disabled={pending}>Confirmer la désinscription</button></p>
    </form>
  );
}
