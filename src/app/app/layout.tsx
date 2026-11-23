import Link from "next/link";
import { MobileMenu } from "./mobile-menu";
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
      {/* Téléphone : barre du haut avec menu complet, et barre d'onglets en bas. */}
      <header className="topbar">
        <Link href="/app" className="brand"><img src="/logo.png" alt="" width={32} height={32} />Agbeci CRM</Link>
        <MobileMenu badge={unseen + due}>
          <NavLinks unseen={unseen} due={due} />
        </MobileMenu>
      </header>
      <nav className="nav">
        <Link href="/app" className="brand"><img src="/logo.png" alt="" width={40} height={40} />Agbeci CRM</Link>
        <NavLinks unseen={unseen} due={due} />
      </nav>
      <main className="content">{children}</main>
      <nav className="tabbar" aria-label="Accès rapide">
        <Link href="/app"><span aria-hidden="true">🏠</span>Accueil</Link>
        <Link href="/app/messages"><span aria-hidden="true">✉️</span>Messages{unseen > 0 && <span className="count">{unseen}</span>}</Link>
        <Link href="/app/rappels"><span aria-hidden="true">⏰</span>Rappels{due > 0 && <span className="count">{due}</span>}</Link>
        <Link href="/app/calendrier"><span aria-hidden="true">📅</span>Calendrier</Link>
        <Link href="/app/contacts"><span aria-hidden="true">👤</span>Contacts</Link>
      </nav>
    </div>
  );
}

function NavLinks({ unseen, due }: { unseen: number; due: number }) {
  return (
    <>
      <Link href="/app">Tableau de bord</Link>
      <Link href="/app/messages">
        Messagerie{unseen > 0 && <span className="count">{unseen}</span>}
      </Link>
      <Link href="/app/contacts">Contacts</Link>
      <Link href="/app/prospection">Prospection</Link>
      <Link href="/app/rappels">
        Rappels{due > 0 && <span className="count">{due}</span>}
      </Link>
      <Link href="/app/calendrier">Calendrier</Link>
      <Link href="/app/envois">Envoi groupé</Link>
      <Link href="/app/abonnes">Abonnés</Link>
      <Link href="/app/newsletters">Newsletters</Link>
      <Link href="/app/reglages">Réglages</Link>
      <form action="/deconnexion" method="post">
        <button className="btn secondary" type="submit">Se déconnecter</button>
      </form>
    </>
  );
}
