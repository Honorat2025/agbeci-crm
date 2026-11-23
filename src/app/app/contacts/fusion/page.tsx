import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { contactLabel, contactPhones, getContact, listContacts } from "@/lib/contacts";
import { contactsByIds, mergePreview, similarContacts } from "@/lib/merge";
import { MergeForm } from "../forms";

export const dynamic = "force-dynamic";

const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).map(Number).filter(Number.isInteger);

export default async function MergePage({ searchParams }: { searchParams: Promise<{ ids?: string | string[]; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const ids = [...new Set(asList(sp.ids))].slice(0, 10);
  if (ids.length === 1) return <PickOthers id={ids[0]!} q={sp.q} />;
  const rows = await contactsByIds(ids);
  if (rows.length < 2) notFound();
  const p = mergePreview(rows);
  const names = [...new Map(rows.filter((r) => r.firstName || r.lastName).map((r) => [contactLabel(r), r.id])).entries()].map(([label, id]) => ({ id, label }));
  const defaultName = names.find((n) => n.id === p.keeper.id)?.id ?? names.sort((a, b) => b.label.length - a.label.length)[0]?.id ?? p.keeper.id;

  return (
    <>
      <p><Link href="/app/contacts/doublons">← Doublons possibles</Link></p>
      <h1>Fusionner {rows.length} fiches</h1>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Fiche</th><th>Email</th><th>Téléphones</th><th className="hide-mobile">Étiquettes</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/app/contacts/${r.id}`}>{contactLabel(r)}</Link></td>
                <td>{r.email ?? ""}</td>
                <td>{contactPhones(r).join(", ")}</td>
                <td className="hide-mobile">{r.tags.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Après la fusion, une seule fiche</h2>
        <ul>
          {p.email && <li>Email : {p.email}</li>}
          {p.phones.map((ph, i) => ph && <li key={i}>Téléphone {i + 1} : {ph}</li>)}
          {p.company && <li>Organisation : {p.company}</li>}
          {p.linkedinUrl && <li>LinkedIn : {p.linkedinUrl}</li>}
          {p.tags.length > 0 && <li>Étiquettes : {p.tags.join(", ")}</li>}
        </ul>
        {(p.otherEmails.length > 0 || p.extraPhones.length > 0) && (
          <p className="notice small">
            Une fiche n&apos;a qu&apos;un email et trois numéros. {p.otherEmails.length > 0 && <>L&apos;autre adresse ({p.otherEmails.join(", ")}) sera notée dans les notes de la fiche. </>}
            {p.extraPhones.length > 0 && <>Les numéros en plus ({p.extraPhones.join(", ")}) seront notés dans les notes de la fiche.</>}
          </p>
        )}
        <p className="muted small">Les notes, rappels, visios, rendez-vous et affaires de ces fiches sont regroupés sur cette fiche. Les autres fiches sont supprimées.</p>
        <MergeForm ids={rows.map((r) => r.id)} names={names} defaultName={defaultName} />
      </div>
    </>
  );
}

/** Depuis une fiche : choisir la ou les fiches à fusionner avec elle. */
async function PickOthers({ id, q }: { id: number; q?: string }) {
  const c = await getContact(id);
  if (!c) notFound();
  const similar = await similarContacts(id);
  const found = q?.trim() ? (await listContacts({ q })).filter((r) => r.id !== id && !similar.some((s) => s.id === r.id)).slice(0, 30) : [];
  const options = [...similar, ...found];
  return (
    <>
      <p><Link href={`/app/contacts/${id}`}>← {contactLabel(c)}</Link></p>
      <h1>Fusionner avec une autre fiche</h1>
      <form className="row card" method="get">
        <input type="hidden" name="ids" value={id} />
        <input type="search" name="q" defaultValue={q} placeholder="Chercher une fiche : nom, téléphone, email..." style={{ flex: 1, minWidth: 200 }} />
        <button className="btn secondary">Chercher</button>
      </form>
      <form className="card" method="get">
        <input type="hidden" name="ids" value={id} />
        <p style={{ marginTop: 0 }}>Cochez les fiches de la même personne que <strong>{contactLabel(c)}</strong> :</p>
        {options.length === 0 ? (
          <p className="muted">{q ? "Aucune fiche trouvée." : "Aucune fiche ne ressemble à celle-ci. Cherchez-la ci-dessus."}</p>
        ) : (
          options.map((r) => (
            <label key={r.id} className="choice">
              <input type="checkbox" name="ids" value={r.id} defaultChecked={similar.some((s) => s.id === r.id)} />
              <span>{contactLabel(r)} <span className="muted small">· {[r.email, ...contactPhones(r)].filter(Boolean).join(" · ")}</span></span>
            </label>
          ))
        )}
        {options.length > 0 && <p style={{ marginBottom: 0 }}><button className="btn secondary">Fusionner…</button></p>}
      </form>
    </>
  );
}
