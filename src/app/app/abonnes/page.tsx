import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireAdmin } from "@/lib/guard";
import { AddSubscriberForm } from "./add-form";

const LABELS: Record<string, string> = {
  subscribed: "Abonné",
  pending: "En attente",
  unsubscribed: "Désinscrit",
  bounced: "Adresse invalide",
  none: "Non abonné",
};

type Status = "subscribed" | "pending" | "unsubscribed" | "bounced" | "none";

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string }>;
}) {
  await requireAdmin();
  const { q, statut } = await searchParams;
  const { contacts } = schema;
  const filters: SQL[] = [];
  if (statut && statut in LABELS) filters.push(eq(contacts.newsletterStatus, statut as Status));
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    filters.push(or(ilike(contacts.email, like), ilike(contacts.firstName, like))!);
  }
  const rows = await getDb()
    .select()
    .from(contacts)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(contacts.createdAt))
    .limit(500);

  return (
    <>
      <h1>Abonnés</h1>
      <form className="row card" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="Chercher un email ou un prénom" style={{ flex: 1, minWidth: 200 }} />
        <select name="statut" defaultValue={statut ?? ""} style={{ width: "auto" }}>
          <option value="">Tous</option>
          {Object.entries(LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn secondary">Filtrer</button>
        <a className="btn secondary" href="/app/abonnes/export">Exporter en CSV</a>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p className="muted">Aucun contact pour l&apos;instant.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Email</th><th>Prénom</th><th>Statut</th><th className="hide-mobile">Source</th><th className="hide-mobile">Depuis</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.email}</td>
                  <td>{c.firstName ?? "—"}</td>
                  <td><span className={`badge ${c.newsletterStatus}`}>{LABELS[c.newsletterStatus]}</span></td>
                  <td className="hide-mobile muted">{c.consentSource ?? c.source}</td>
                  <td className="hide-mobile muted">{c.createdAt.toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Ajouter un abonné à la main</h2>
        <p className="muted">
          Seulement pour une personne qui vous a demandé à recevoir la newsletter. Les autres doivent passer par
          le formulaire, qui demande une confirmation par email.
        </p>
        <AddSubscriberForm />
      </div>
    </>
  );
}
