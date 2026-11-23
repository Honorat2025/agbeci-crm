import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import {
  formatAmount,
  formatDay,
  isKind,
  KIND_LABELS,
  listOpportunities,
  OPEN_STAGES,
  OPPORTUNITY_STAGES_LIST,
  STAGE_LABELS,
  todayParis,
  type Kind,
} from "@/lib/prospection";
import { changeStage } from "./actions";

export default async function ProspectionPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const kind: Kind | undefined = isKind(sp.type) ? sp.type : undefined;
  const rows = await listOpportunities({ kind });
  const today = todayParis();
  const open = rows.filter((r) => OPEN_STAGES.includes(r.o.stage));
  const closed = rows.filter((r) => !OPEN_STAGES.includes(r.o.stage)).slice(0, 30);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Prospection</h1>
        <Link className="btn" href={`/app/prospection/nouvelle${kind ? `?type=${kind}` : ""}`}>Nouvelle affaire</Link>
      </div>
      <p className="muted">Clients, consultations, prestations et pistes d&apos;emploi : chaque affaire avance d&apos;étape en étape jusqu&apos;à « Gagnée » ou « Perdue ».</p>

      <nav className="tabs">
        <Link href="/app/prospection" aria-current={!kind ? "page" : undefined}>Toutes</Link>
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <Link key={k} href={`/app/prospection?type=${k}`} aria-current={kind === k ? "page" : undefined}>{KIND_LABELS[k]}</Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>Aucune affaire pour l&apos;instant.</p>
          <p className="muted">
            Une affaire, c&apos;est une demande de consultation, un client potentiel, une offre de mission ou un poste qui vous intéresse.
            Créez-la ici ou depuis la fiche d&apos;un contact, puis ajoutez un rappel pour ne pas oublier de relancer.
          </p>
        </div>
      ) : (
        <div className="board">
          {OPEN_STAGES.map((stage) => {
            const inStage = open.filter((r) => r.o.stage === stage);
            const totals = new Map<string, number>();
            for (const r of inStage) if (r.o.amount) totals.set(r.o.currency, (totals.get(r.o.currency) ?? 0) + r.o.amount);
            return (
              <section key={stage} className="col">
                <h2>{STAGE_LABELS[stage]} <span className="muted">({inStage.length})</span></h2>
                <div className="muted small sum">{[...totals].map(([c, n]) => formatAmount(n, c)).join(" · ") || " "}</div>
                {inStage.map(({ o, contactName, contactEmail, nextTask }) => (
                  <div key={o.id} className="deal">
                    <Link className="title" href={`/app/prospection/${o.id}`}>{o.title}</Link>
                    <div className="small muted">
                      {!kind && <span className="kind">{KIND_LABELS[o.kind]}</span>} {o.organization ?? contactName ?? contactEmail ?? ""}
                      {o.country && <> · {o.country}</>}
                    </div>
                    {o.amount !== null && <div className="small">{formatAmount(o.amount, o.currency)}</div>}
                    <div className={`small next${nextTask && nextTask < today ? " late" : ""}`}>
                      {nextTask ? <>Prochain rappel : {nextTask === today ? "aujourd'hui" : formatDay(nextTask)}</> : <span className="muted">Aucun rappel prévu</span>}
                    </div>
                    <form action={changeStage}>
                      <input type="hidden" name="id" value={o.id} />
                      <label className="small muted" htmlFor={`s-${o.id}`} style={{ display: "none" }}>Étape</label>
                      <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                        <select id={`s-${o.id}`} name="stage" defaultValue={o.stage}>
                          {OPPORTUNITY_STAGES_LIST.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                        </select>
                        <button className="linkbtn small">OK</button>
                      </div>
                    </form>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {closed.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Affaires terminées</h2>
          <table className="closed-list">
            <tbody>
              {closed.map(({ o, contactName }) => (
                <tr key={o.id}>
                  <td>{o.stage === "gagnee" ? "✅" : "✖️"} <Link href={`/app/prospection/${o.id}`}>{o.title}</Link></td>
                  <td className="muted">{KIND_LABELS[o.kind]}</td>
                  <td className="muted">{o.organization ?? contactName ?? ""}</td>
                  <td>{formatAmount(o.amount, o.currency)}</td>
                  <td className="muted">{o.closedAt?.toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
