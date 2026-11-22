import { count } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb, schema } from "@/db";
import { totpUri } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { CodeForm, StartForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ etape?: string }> }) {
  const [row] = await getDb().select({ n: count() }).from(schema.admins);
  if (Number(row?.n ?? 0) > 0) {
    return (
      <div className="public card">
        <h1>Déjà installé</h1>
        <p>Le compte administrateur existe. <a href="/connexion">Se connecter</a></p>
      </div>
    );
  }

  const { etape } = await searchParams;
  const session = await getSession();
  const pending = session.pendingSetup;

  if (etape === "2" && pending) {
    const qr = await QRCode.toDataURL(totpUri(pending.email, pending.totpSecret), { margin: 1, width: 220 });
    return (
      <div className="public card">
        <h1>Étape 2 : la double authentification</h1>
        <p>
          Installez une application de codes sur votre téléphone (Google Authenticator, Microsoft Authenticator
          ou 2FAS), puis scannez ce QR code.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="qr"><img src={qr} alt="QR code de double authentification" width={220} height={220} /></div>
        <p className="muted">Pas de caméra ? Saisissez cette clé à la main : <code>{pending.totpSecret}</code></p>
        <CodeForm />
      </div>
    );
  }

  return (
    <div className="public card">
      <h1>Installation d&apos;Agbeci CRM</h1>
      <p>Créez votre compte administrateur. Cette page ne sert qu&apos;une seule fois.</p>
      <StartForm />
    </div>
  );
}
