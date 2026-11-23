import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { unseenInboxCount } from "@/lib/messages";
import { openTasks, todayParis } from "@/lib/prospection";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const unseen = await unseenInboxCount().catch(() => 0);
  const due = await openTasks({ until: todayParis() }).then((r) => r.length).catch(() => 0);
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">Agbeci CRM</div>
        <Link href="/app">Tableau de bord</Link>
        <Link href="/app/messages">
          Messagerie{unseen > 0 && <span className="count">{unseen}</span>}
        </Link>
        <Link href="/app/contacts">Contacts</Link>
        <Link href="/app/prospection">Prospection</Link>
        <Link href="/app/rappels">
          Rappels{due > 0 && <span className="count">{due}</span>}
        </Link>
        <Link href="/app/envois">Envoi groupé</Link>
        <Link href="/app/abonnes">Abonnés</Link>
        <Link href="/app/newsletters">Newsletters</Link>
        <Link href="/app/reglages">Réglages</Link>
        <form action="/deconnexion" method="post">
          <button className="btn secondary" type="submit">Se déconnecter</button>
        </form>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
