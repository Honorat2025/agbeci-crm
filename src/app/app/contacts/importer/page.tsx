import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { ImportForm } from "../forms";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <>
      <p><Link href="/app/contacts">← Contacts</Link></p>
      <h1>Importer vos contacts</h1>
      <p className="muted">Le même bouton accepte les deux fichiers : le CRM reconnaît tout seul s&apos;il vient de Google ou de LinkedIn.</p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Vos contacts Google</h2>
        <ol>
          <li>Ouvrez <a href="https://contacts.google.com/" target="_blank" rel="noopener">contacts.google.com</a>.</li>
          <li>À gauche, cliquez sur <strong>Exporter</strong> (ou sur les trois points en haut, puis « Exporter »).</li>
          <li>Choisissez <strong>Tous les contacts</strong> et le format <strong>Google CSV</strong>, puis cliquez sur « Exporter ». Un fichier se télécharge.</li>
          <li>Choisissez ce fichier ci-dessous et cliquez sur « Importer ».</li>
        </ol>
        <p className="muted small">
          Les contacts qui n&apos;ont qu&apos;un numéro de téléphone sont gardés aussi. Vos groupes Google (par exemple « ONG Afrique ») deviennent des étiquettes.
        </p>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Vos relations LinkedIn</h2>
        <ol>
          <li>Ouvrez <a href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noopener">la page « Obtenir une copie de vos données »</a> de LinkedIn.</li>
          <li>Cochez <strong>Relations</strong> seulement, puis cliquez sur « Demander l&apos;archive ».</li>
          <li>LinkedIn vous envoie un email avec un lien (en général en moins de 30 minutes). Téléchargez l&apos;archive et ouvrez-la : elle contient un fichier <strong>Connections.csv</strong>.</li>
          <li>Choisissez ce fichier ci-dessous et cliquez sur « Importer ».</li>
        </ol>
        <p className="muted small">
          Chaque relation arrive avec son nom, son poste, son entreprise et le lien de son profil, et l&apos;étiquette « linkedin ». L&apos;email n&apos;y figure que si la personne l&apos;a autorisé.
        </p>
      </div>
      <div className="card">
        <ImportForm />
        <p className="muted small">
          Une fiche qui existe déjà (même email, même profil LinkedIn ou même numéro) n&apos;est pas écrasée : seuls les champs vides sont complétés.
          Personne n&apos;est abonné à la newsletter par un import.
        </p>
      </div>
    </>
  );
}
