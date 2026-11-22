import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { suggestedContacts } from "@/lib/contacts";
import { addSuggested } from "../actions";

export default async function SuggestionsPage({ searchParams }: { searchParams: Promise<{ ajoutes?: string }> }) {
  await requireAdmin();
  const { ajoutes } = await searchParams;
  const rows = await suggestedContacts(100);
  return (
    <>
      <p><Link href="/app/contacts">← Contacts</Link></p>
      <h1>Suggestions de contacts</h1>
      <p className="muted">
        Les personnes à qui vous avez écrit vous-même depuis Gmail, et qui n&apos;ont pas encore de fiche. Cochez celles à garder.
        Elles ne sont pas abonnées à la newsletter pour autant.
      </p>
      {ajoutes && <p className="success">{ajoutes} fiche(s) créée(s).</p>}
      {rows.length === 0 ? (
        <p className="card muted">Pas de suggestion pour l&apos;instant. Elles apparaîtront au fil de la recopie de vos emails.</p>
      ) : (
        <form action={addSuggested} className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th></th><th>Nom</th><th>Email</th><th className="hide-mobile">Emails envoyés</th><th className="hide-mobile">Dernier</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.address}>
                  <td><input type="checkbox" name="pick" value={`${r.address}\u0000${r.name ?? ""}`} defaultChecked={r.sent >= 2} aria-label={`Garder ${r.address}`} /></td>
                  <td>{r.name ?? "—"}</td>
                  <td>{r.address}</td>
                  <td className="hide-mobile">{r.sent}</td>
                  <td className="hide-mobile muted">{r.last.toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><button className="btn">Créer les fiches cochées</button></p>
        </form>
      )}
    </>
  );
}
