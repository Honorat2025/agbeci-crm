import { UnsubscribeForm } from "./form";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <div className="public card">
      <UnsubscribeForm token={t ?? ""} />
    </div>
  );
}
