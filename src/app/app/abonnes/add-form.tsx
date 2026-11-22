"use client";

import { useActionState, useState } from "react";
import { addSubscriber, type AddState } from "./actions";

export function AddSubscriberForm() {
  const [state, action, pending] = useActionState<AddState, FormData>(addSubscriber, {});
  const [v, setV] = useState({ email: "", firstName: "", note: "" });
  const bind = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form action={action}>
      <div className="grid2">
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required {...bind("email")} />
        </div>
        <div>
          <label htmlFor="firstName">Prénom (facultatif)</label>
          <input id="firstName" name="firstName" type="text" {...bind("firstName")} />
        </div>
      </div>
      <label htmlFor="note">Comment a-t-elle donné son accord ?</label>
      <input id="note" name="note" type="text" placeholder="Ex. : demandé par email le 22/11/2026" required {...bind("note")} />
      <label style={{ fontWeight: 400 }}>
        <input type="checkbox" name="consent" /> Cette personne m&apos;a demandé à recevoir la newsletter.
      </label>
      {state.error && <p className="error">{state.error}</p>}
      {state.ok && <p className="success">{state.ok}</p>}
      <p><button className="btn" disabled={pending}>Ajouter</button></p>
    </form>
  );
}
