import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/guard";
import { getNewsletter, newsletterProgress, previewHtml } from "@/lib/newsletters";
import { remainingQuota, sentInLast24h } from "@/lib/queue";
import { deleteAction, saveAction, sendAction, testAction } from "../actions";
import { NewsletterEditor, SmallForm } from "../editor";

export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const n = await getNewsletter(id);
  if (!n) notFound();

  const html = previewHtml(n);

  if (n.status !== "draft") {
    const p = (await newsletterProgress([n.id])).get(n.id) ?? {};
    return (
      <>
        <h1>{n.subject}</h1>
        <div className="stats">
          <div className="stat"><div className="n">{p.sent ?? 0}</div><div className="l">envoyés</div></div>
          <div className="stat"><div className="n">{(p.pending ?? 0) + (p.sending ?? 0)}</div><div className="l">en attente</div></div>
          <div className="stat"><div className="n">{p.failed ?? 0}</div><div className="l">en échec</div></div>
          <div className="stat"><div className="n">{n.recipientsCount}</div><div className="l">destinataires</div></div>
        </div>
        {n.status === "sending" && (
          <p className="notice">
            Envoi en cours, au rythme d&apos;un email toutes les {Math.round(env.sendIntervalMs / 1000)} secondes et
            de {env.dailySendLimit} au maximum par 24 heures. Au-delà, la suite part automatiquement le lendemain.
          </p>
        )}
        <iframe className="preview" sandbox="" srcDoc={html} title="Aperçu" />
      </>
    );
  }

  const [{ n: subscribers } = { n: 0 }] = await getDb()
    .select({ n: count() })
    .from(schema.contacts)
    .where(eq(schema.contacts.newsletterStatus, "subscribed"));
  const quota = remainingQuota(await sentInLast24h(), env.dailySendLimit);

  return (
    <>
      <h1>Brouillon : {n.subject}</h1>
      {n.origin === "wordpress" && n.originUrl && (
        <p className="notice">
          Brouillon préparé automatiquement après la publication de <a href={n.originUrl}>cet article</a>. Relisez-le
          avant de l&apos;envoyer.
        </p>
      )}
      <div className="grid2">
        <div className="card">
          <NewsletterEditor action={saveAction.bind(null, n.id)} initial={n} submitLabel="Enregistrer" />
        </div>
        <div>
          <iframe className="preview" sandbox="" srcDoc={html} title="Aperçu" />
          <p className="muted">L&apos;aperçu se met à jour après « Enregistrer ».</p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>1. M&apos;envoyer un test</h2>
        <SmallForm action={testAction.bind(null, n.id)} button="Envoyer le test">
          <label htmlFor="to">Adresse</label>
          <input id="to" name="to" type="email" defaultValue={env.gmailAddress} />
        </SmallForm>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>2. Envoyer à tous les abonnés</h2>
        <p>
          {Number(subscribers)} abonné(s) confirmé(s). Envois encore possibles aujourd&apos;hui : {quota}.
          {Number(subscribers) > quota && " Le reste partira automatiquement dans les jours suivants."}
        </p>
        <SmallForm action={sendAction.bind(null, n.id)} button="Envoyer maintenant">
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" name="confirm" /> J&apos;ai relu la newsletter et je veux l&apos;envoyer.
          </label>
        </SmallForm>
      </div>

      <form action={deleteAction.bind(null, n.id)}>
        <button className="btn danger">Supprimer ce brouillon</button>
      </form>
    </>
  );
}
