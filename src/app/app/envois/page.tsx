import { requireAdmin } from "@/lib/guard";
import { allTags, BULK_MAX, recentBulkSends } from "@/lib/prospection";
import { getMailSettings } from "@/lib/settings";
import Link from "next/link";
import { BulkForm } from "../prospection/forms";

export default async function BulkPage() {
  await requireAdmin();
  const [tags, sends, mail] = await Promise.all([allTags(), recentBulkSends(), getMailSettings()]);
  return (
    <>
      <h1>Envoi groupé personnalisé</h1>
      <p className="muted">
        Écrivez un seul message et envoyez-le à un groupe de contacts (par étiquette) : chacun reçoit un email personnel, à son nom, depuis votre Gmail.
        Idéal pour proposer vos services à des cliniques, des ONG ou des partenaires. Les réponses arrivent dans votre messagerie.
      </p>
      {!mail.configured && <p className="notice">Branchez d&apos;abord Gmail dans <Link href="/app/reglages">Réglages</Link>.</p>}
      <div className="card">
        <BulkForm tags={tags} />
      </div>
      <p className="muted small">
        Pour protéger votre adresse Gmail : {BULK_MAX} destinataires au maximum par envoi, et le quota quotidien est respecté (le surplus part les jours suivants).
        Ne reçoivent pas l&apos;envoi : les personnes désinscrites, les adresses en erreur, et les fiches marquées « ne pas inclure dans les envois groupés ».
      </p>
      {sends.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Envois précédents</h2>
          <table>
            <tbody>
              {sends.map((s) => (
                <tr key={s.id}>
                  <td>{s.subject}</td>
                  <td><span className="tag">{s.tag}</span></td>
                  <td>{s.recipients} destinataire(s)</td>
                  <td className="muted">{s.createdAt.toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
