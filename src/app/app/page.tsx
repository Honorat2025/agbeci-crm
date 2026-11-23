import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/guard";
import { outboxStats, remainingQuota, sentInLast24h } from "@/lib/queue";
import { getMailSettings } from "@/lib/settings";
import { unseenInboxCount } from "@/lib/messages";
import { openTasks, pipelineSummary, STAGE_LABELS, todayParis } from "@/lib/prospection";
import { TaskList } from "./prospection/task-list";
import { upcomingMeetings } from "@/lib/meetings";
import { MeetingList } from "./visios/meeting-list";

export default async function Dashboard() {
  await requireAdmin();
  const db = getDb();
  const { contacts } = schema;

  const byStatus = await db
    .select({ status: contacts.newsletterStatus, n: count() })
    .from(contacts)
    .groupBy(contacts.newsletterStatus);
  const n = (s: string) => Number(byStatus.find((r) => r.status === s)?.n ?? 0);

  const latest = await db
    .select()
    .from(contacts)
    .where(eq(contacts.newsletterStatus, "subscribed"))
    .orderBy(desc(contacts.confirmedAt))
    .limit(5);

  const sent24 = await sentInLast24h();
  const queue = await outboxStats();
  const mail = await getMailSettings();
  const unseen = mail.configured ? await unseenInboxCount() : 0;
  const [todo, pipeline, visios] = await Promise.all([openTasks({ until: todayParis() }), pipelineSummary(), upcomingMeetings({ limit: 5 })]);
  const openDeals = pipeline.reduce((a, p) => a + p.count, 0);

  return (
    <>
      <h1>Tableau de bord</h1>
      <div className="stats">
        <div className="stat"><div className="n">{n("subscribed")}</div><div className="l">abonnés confirmés</div></div>
        <div className="stat"><div className="n">{n("pending")}</div><div className="l">en attente de confirmation</div></div>
        <div className="stat"><div className="n">{n("unsubscribed")}</div><div className="l">désinscrits</div></div>
        <div className="stat">
          <div className="n">{remainingQuota(sent24, env.dailySendLimit)}</div>
          <div className="l">envois encore possibles aujourd&apos;hui (sur {env.dailySendLimit})</div>
        </div>
      </div>

      {!mail.configured && (
        <p className="notice">
          Gmail n&apos;est pas encore branché : aucun email ne part pour l&apos;instant.{" "}
          <Link href="/app/reglages">Brancher Gmail</Link>
        </p>
      )}
      {queue.failed > 0 && (
        <p className="notice">{queue.failed} email(s) n&apos;ont pas pu partir après plusieurs essais.</p>
      )}
      {queue.pending > 0 && <p className="muted">{queue.pending} email(s) en attente d&apos;envoi.</p>}

      {mail.configured && (
        <p className="card">
          {unseen > 0 ? <>Vous avez <strong>{unseen}</strong> conversation(s) non lue(s). </> : "Aucun email non lu. "}
          <Link href="/app/messages">Ouvrir la messagerie</Link>
        </p>
      )}

      {visios.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Prochaines visios</h2>
          <MeetingList rows={visios} />
        </div>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>À faire aujourd&apos;hui</h2>
          <Link href="/app/rappels">Tous les rappels</Link>
        </div>
        <TaskList rows={todo} empty="Rien d'urgent aujourd'hui." />
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Prospection</h2>
          <Link href="/app/prospection">{openDeals > 0 ? `${openDeals} affaire(s) en cours` : "Créer une première affaire"}</Link>
        </div>
        {openDeals > 0 && (
          <div className="stats" style={{ marginTop: 12, marginBottom: 0 }}>
            {pipeline.map((p) => (
              <div key={p.stage} className="stat">
                <div className="n">{p.count}</div>
                <div className="l">{STAGE_LABELS[p.stage]}</div>
                {p.totals.length > 0 && <div className="small">{p.totals.join(" · ")}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Derniers abonnés</h2>
        {latest.length === 0 ? (
          <p className="muted">
            Pas encore d&apos;abonné. Partagez votre page d&apos;inscription :{" "}
            <a href={`${env.appUrl}/inscription`}>{env.appUrl}/inscription</a>
          </p>
        ) : (
          <table>
            <tbody>
              {latest.map((c) => (
                <tr key={c.id}>
                  <td>{c.firstName ?? "—"}</td>
                  <td>{c.email}</td>
                  <td className="muted">{c.confirmedAt?.toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p><Link className="btn" href="/app/newsletters/nouvelle">Écrire une newsletter</Link></p>
    </>
  );
}
