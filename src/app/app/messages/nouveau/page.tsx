import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { NewMessageForm } from "../compose-forms";

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  await requireAdmin();
  const { a } = await searchParams;
  return (
    <>
      <p><Link href="/app/messages">← Messagerie</Link></p>
      <h1>Nouveau message</h1>
      <p className="muted">Le message part depuis votre adresse Gmail, et vous le retrouverez dans vos « Envoyés » de Gmail.</p>
      <NewMessageForm to={a ?? ""} />
    </>
  );
}
