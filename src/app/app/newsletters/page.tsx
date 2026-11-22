import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { listNewsletters, newsletterProgress } from "@/lib/newsletters";

const LABELS = { draft: "Brouillon", sending: "En cours d'envoi", sent: "Envoyée" } as const;

export default async function NewslettersPage() {
  await requireAdmin();
  const list = await listNewsletters();
  const progress = await newsletterProgress(list.filter((n) => n.status !== "draft").map((n) => n.id));
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Newsletters</h1>
        <Link className="btn" href="/app/newsletters/nouvelle">Nouvelle newsletter</Link>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {list.length === 0 ? (
          <p className="muted">Aucune newsletter. Écrivez la première !</p>
        ) : (
          <table>
            <thead><tr><th>Objet</th><th>Statut</th><th>Envoyés</th><th className="hide-mobile">Créée le</th></tr></thead>
            <tbody>
              {list.map((n) => {
                const p = progress.get(n.id) ?? {};
                return (
                  <tr key={n.id}>
                    <td>
                      <Link href={`/app/newsletters/${n.id}`}>{n.subject}</Link>
                      {n.origin === "wordpress" && <span className="muted"> · depuis le blog</span>}
                    </td>
                    <td><span className={`badge ${n.status}`}>{LABELS[n.status]}</span></td>
                    <td>{n.status === "draft" ? "—" : `${p.sent ?? 0} / ${n.recipientsCount}`}</td>
                    <td className="hide-mobile muted">{n.createdAt.toLocaleDateString("fr-FR")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
