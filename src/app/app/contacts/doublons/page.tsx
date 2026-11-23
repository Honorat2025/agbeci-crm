import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { contactLabel, contactPhones } from "@/lib/contacts";
import { duplicateGroups } from "@/lib/merge";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  await requireAdmin();
  const groups = await duplicateGroups();
  return (
    <>
      <p><Link href="/app/contacts">← Contacts</Link></p>
      <h1>Doublons possibles</h1>
      <p className="muted">
        Ces fiches semblent appartenir à la même personne : même numéro de téléphone, ou même nom écrit autrement
        (« Morel AGBECI » et « Morel Frido AGBECI »). Décochez les fiches qui ne sont pas la même personne, puis cliquez sur « Fusionner ».
        Vous verrez le résultat avant de confirmer.
      </p>
      {groups.length === 0 ? (
        <div className="card"><p className="muted">Aucun doublon repéré.</p></div>
      ) : (
        <>
          <p><strong>{groups.length}</strong> groupe(s) à vérifier.</p>
          {groups.map((g) => (
            <form key={g[0]!.id} className="card dup-group" method="get" action="/app/contacts/fusion">
              {g.map((c) => (
                <label key={c.id} className="choice">
                  <input type="checkbox" name="ids" value={c.id} defaultChecked />
                  <span>
                    <Link href={`/app/contacts/${c.id}`}>{contactLabel(c)}</Link>
                    <span className="muted small"> · {[c.email, ...contactPhones(c), c.company].filter(Boolean).join(" · ") || "sans coordonnées"}</span>
                  </span>
                </label>
              ))}
              <p style={{ marginBottom: 0 }}><button className="btn secondary">Fusionner…</button></p>
            </form>
          ))}
        </>
      )}
    </>
  );
}
