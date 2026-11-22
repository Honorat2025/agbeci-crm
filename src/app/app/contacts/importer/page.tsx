import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { ImportForm } from "../forms";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <>
      <p><Link href="/app/contacts">← Contacts</Link></p>
      <h1>Importer vos contacts Google</h1>
      <div className="card">
        <ol>
          <li>Ouvrez <a href="https://contacts.google.com/" target="_blank" rel="noopener">contacts.google.com</a>.</li>
          <li>À gauche, cliquez sur <strong>Exporter</strong> (ou sur les trois points en haut, puis « Exporter »).</li>
          <li>Choisissez <strong>Tous les contacts</strong> et le format <strong>Google CSV</strong>, puis cliquez sur « Exporter ». Un fichier se télécharge.</li>
          <li>Choisissez ce fichier ci-dessous et cliquez sur « Importer ».</li>
        </ol>
        <p className="muted">
          Les contacts sans adresse email sont ignorés. Une fiche qui existe déjà n&apos;est pas écrasée : seuls les champs vides sont complétés.
          Personne n&apos;est abonné à la newsletter par cet import.
        </p>
        <ImportForm />
      </div>
    </>
  );
}
