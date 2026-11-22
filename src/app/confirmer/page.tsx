import { ConfirmForm } from "./form";

/**
 * La confirmation demande un clic sur un bouton : certains antivirus ouvrent
 * automatiquement les liens des emails, ce qui confirmerait sans l'accord de la personne.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <div className="public card">
      <ConfirmForm token={t ?? ""} />
    </div>
  );
}
