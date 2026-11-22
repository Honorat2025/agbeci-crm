import Link from "next/link";
import { requireAdmin } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">Agbeci CRM</div>
        <Link href="/app">Tableau de bord</Link>
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
