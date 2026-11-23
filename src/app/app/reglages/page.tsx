import { getMailSettings } from "@/lib/settings";
import { formatSize, isRecent, listBackups } from "@/lib/backups";
import { GmailForm } from "./gmail-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [s, backups] = await Promise.all([getMailSettings(), listBackups()]);
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

      <section className="card">
        <h2>Sauvegardes</h2>
        {backups === null ? (
          <p className="notice">Les sauvegardes automatiques ne sont pas encore activées sur ce serveur.</p>
        ) : backups.length === 0 ? (
          <p className="muted">La première sauvegarde sera faite cette nuit, vers 3 h.</p>
        ) : (
          <>
            {isRecent(backups) ? (
              <p className="success">Une copie complète de vos données est faite chaque nuit vers 3 h et gardée 14 jours.</p>
            ) : (
              <p className="notice">Attention : la dernière sauvegarde date de plus d&apos;un jour. Prévenez Claude.</p>
            )}
            <table>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name}>
                    <td>{b.date.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" })}</td>
                    <td className="muted">{formatSize(b.size)}</td>
                    <td><a href={`/app/reglages/sauvegardes/${b.name}`} download>Télécharger</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              Ces copies sont sur le serveur. De temps en temps (une fois par mois par exemple), téléchargez la plus récente et rangez-la dans
              votre Google Drive : vos données seront à l&apos;abri même si le serveur disparaissait. Vos emails, eux, restent toujours dans Gmail.
            </p>
          </>
        )}
      </section>
    </>
  );
}
