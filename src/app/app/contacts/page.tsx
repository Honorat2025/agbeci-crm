import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { contactLabel, contactPhones, initialOf, listContacts, sortName } from "@/lib/contacts";
import { NewContactForm } from "./forms";

const NEWSLETTER: Record<string, string> = {
  subscribed: "Abonné",
  pending: "En attente",
  unsubscribed: "Désinscrit",
  bounced: "Adresse invalide",
};

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  await requireAdmin();
  const { q, tag } = await searchParams;
  const rows = await listContacts({ q, tag });
  const initials = rows.map((c) => initialOf(sortName(c)));
  const letters = [...new Set(initials)];
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Contacts</h1>
        <div className="row">
          <Link className="btn secondary" href="/app/contacts/doublons">Doublons</Link>
          <Link className="btn secondary" href="/app/contacts/suggestions">Suggestions</Link>
          <Link className="btn secondary" href="/app/contacts/importer">Importer</Link>
        </div>
      </div>
      <form className="row card" method="get" style={{ marginTop: 16 }}>
        <input type="search" name="q" defaultValue={q} placeholder="Nom, email, téléphone, organisation, pays..." style={{ flex: 1, minWidth: 200 }} />
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button className="btn secondary">Chercher</button>
        {tag && <Link href="/app/contacts">Retirer le filtre « {tag} »</Link>}
      </form>

      {rows.length > 20 && (
        <nav className="az" aria-label="Aller à la lettre">
          {letters.map((l) => <a key={l} href={`#lettre-${l}`}>{l}</a>)}
        </nav>
      )}
      <p className="muted small">{rows.length} fiche(s), classées de A à Z.</p>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p className="muted">
            Aucune fiche pour l&apos;instant. Commencez par les <Link href="/app/contacts/suggestions">suggestions</Link> : les personnes à qui vous écrivez dans Gmail.
          </p>
        ) : (
          <table>
            <thead>
              <tr><th>Nom</th><th>Email ou téléphone</th><th className="hide-mobile">Organisation</th><th className="hide-mobile">Étiquettes</th></tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id} id={i === initials.indexOf(initials[i]!) ? `lettre-${initials[i]}` : undefined}>
                  <td>
                    <Link href={`/app/contacts/${c.id}`}>{[c.firstName, c.lastName].filter(Boolean).join(" ") || contactLabel(c)}</Link>
                    {NEWSLETTER[c.newsletterStatus] && <> <span className={`badge ${c.newsletterStatus}`}>{NEWSLETTER[c.newsletterStatus]}</span></>}
                  </td>
                  <td>{c.email ?? (contactPhones(c).join(", ") || (c.linkedinUrl ? "LinkedIn" : ""))}</td>
                  <td className="hide-mobile">{c.company ?? ""}</td>
                  <td className="hide-mobile">
                    {c.tags.map((t) => (
                      <Link key={t} className="tag" href={`/app/contacts?tag=${encodeURIComponent(t)}`}>{t}</Link>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Créer une fiche</h2>
        <NewContactForm />
      </div>
    </>
  );
}
