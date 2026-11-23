import { getMailSettings } from "@/lib/settings";
import { formatSize, isRecent, listBackups } from "@/lib/backups";
import { GmailForm } from "./gmail-form";
import { digestEnabled, DIGEST_HOUR } from "@/lib/digest";
import { sendDigestNow, toggleDigest } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ matin?: string }> }) {
  const sp = await searchParams;
  const [s, backups, morning] = await Promise.all([getMailSettings(), listBackups(), digestEnabled()]);
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

      <section className="card" id="matin">
        <h2>Email du matin</h2>
        <p>
          {morning ? (
            <>Chaque matin vers {DIGEST_HOUR} h, vous recevez dans votre Gmail un récapitulatif : visios du jour, rappels du jour et en retard, messages non lus.
              Les jours où il n&apos;y a rien d&apos;urgent, rien n&apos;est envoyé.</>
          ) : (
            <>L&apos;email du matin est coupé.</>
          )}
        </p>
        {sp.matin === "envoye" && <p className="success">C&apos;est parti : l&apos;email arrive dans votre Gmail d&apos;ici une minute.</p>}
        <div className="row">
          <form action={toggleDigest}>
            <input type="hidden" name="value" value={morning ? "off" : "on"} />
            <button className={morning ? "btn secondary" : "btn"}>{morning ? "Couper l'email du matin" : "Activer l'email du matin"}</button>
          </form>
          {s.configured && (
            <form action={sendDigestNow}>
              <button className="linkbtn">M&apos;envoyer celui d&apos;aujourd&apos;hui maintenant</button>
            </form>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Le CRM sur votre téléphone</h2>
        <p>Le CRM s&apos;installe comme une application, avec son icône sur l&apos;écran d&apos;accueil. Ouvrez d&apos;abord crm.honoratagbeci.com sur le téléphone et connectez-vous, puis :</p>
        <ul>
          <li><strong>Android (Chrome)</strong> : touchez les trois points en haut à droite, puis « Installer l&apos;application » (ou « Ajouter à l&apos;écran d&apos;accueil »).</li>
          <li><strong>iPhone (Safari)</strong> : touchez le bouton Partager (carré avec une flèche), puis « Sur l&apos;écran d&apos;accueil ».</li>
        </ul>
        <p className="muted small">Vous restez connecté 14 jours ; ensuite, le CRM vous redemande le mot de passe et le code à deux étapes.</p>
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
