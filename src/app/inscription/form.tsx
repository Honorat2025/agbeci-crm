"use client";

import { useState } from "react";

/** Formulaire d'inscription autonome, à partager en lien (réseaux sociaux, signature d'email...). */
export function SubscribeForm() {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/public/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          firstName: f.get("firstName") || undefined,
          consent: f.get("consent") === "on",
          website: f.get("website") || undefined,
          source: "page d'inscription",
        }),
      });
      const data = await res.json();
      setStatus({ ok: Boolean(data.ok), message: data.message ?? data.error });
    } catch {
      setStatus({ ok: false, message: "Erreur réseau, réessayez." });
    } finally {
      setPending(false);
    }
  }

  if (status?.ok) return <p className="success">{status.message}</p>;

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="firstName">Prénom</label>
      <input id="firstName" name="firstName" type="text" autoComplete="given-name" />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required autoComplete="email" />
      <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
        <label htmlFor="website">Site web</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <label style={{ fontWeight: 400 }}>
        <input type="checkbox" name="consent" required /> J&apos;accepte de recevoir la newsletter. Je peux me
        désinscrire à tout moment.
      </label>
      {status && !status.ok && <p className="error">{status.message}</p>}
      <p><button className="btn" disabled={pending}>Je m&apos;inscris</button></p>
    </form>
  );
}
