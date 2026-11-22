import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/guard";
import { outboxStats, remainingQuota, sentInLast24h } from "@/lib/queue";
import { getMailSettings } from "@/lib/settings";

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
