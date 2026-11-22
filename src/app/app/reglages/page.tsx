import { getMailSettings } from "@/lib/settings";
import { GmailForm } from "./gmail-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getMailSettings();
  return (
    <>
      <h1>Réglages</h1>
      <section className="card">
        <h2>Envoi des emails par Gmail</h2>
        {s.configured ? (
          <p className="success">Gmail est branché ({s.address}). Les emails partent depuis votre boîte.</p>
        ) : (
          <p className="notice">
            Gmail n&apos;est pas encore branché : aucun email ne part. Les emails de confirmation attendent et partiront dès que
            la connexion sera enregistrée.
          </p>
        )}
        <GmailForm address={s.address} fromName={s.fromName} hasPassword={s.source === "application"} />
      </section>
    </>
  );
}
