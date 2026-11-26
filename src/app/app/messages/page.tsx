import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { syncState } from "@/lib/mailbox";
import { listThreads, pendingPersonal, shortDate, unseenInboxCount, type Folder } from "@/lib/messages";
import { getMailSettings } from "@/lib/settings";
import { refreshMailbox } from "./actions";
import { ThreadList } from "./thread-list";

const FOLDERS: { key: Folder; label: string }[] = [
  { key: "nonlus", label: "Non lus" },
  { key: "reception", label: "Boîte de réception" },
  { key: "envoyes", label: "Envoyés" },
  { key: "tous", label: "Tous les messages" },
];

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; q?: string; page?: string; envoye?: string; supprime?: string; lus?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const folder = (FOLDERS.find((f) => f.key === sp.dossier)?.key ?? "reception") as Folder;
  const mail = await getMailSettings();
  if (!mail.configured) {
    return (
      <>
        <h1>Messagerie</h1>
        <p className="notice">
          Branchez d&apos;abord votre Gmail dans <Link href="/app/reglages">Réglages</Link> : vos emails apparaîtront ici.
        </p>
      </>
    );
  }
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ threads, hasMore }, state, pending, unseen] = await Promise.all([
    listThreads({ folder, q: sp.q, page }),
    syncState(),
    pendingPersonal(),
    unseenInboxCount(),
  ]);
  const link = (p: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const all = { dossier: folder, q: sp.q, ...p };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "" && !(k === "page" && String(v) === "1")) params.set(k, String(v));
    return `/app/messages?${params}`;
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Messagerie</h1>
        <div className="row">
          <form action={refreshMailbox}>
            <button className="btn secondary">Actualiser</button>
          </form>
          <Link className="btn" href="/app/messages/nouveau">Nouveau message</Link>
        </div>
      </div>

      <nav className="tabs" aria-label="Dossiers">
        {FOLDERS.map((f) => (
          <Link key={f.key} href={link({ dossier: f.key, page: 1 })} aria-current={f.key === folder ? "page" : undefined}>
            {f.label}
            {f.key === "nonlus" && unseen > 0 && <span className="count">{unseen}</span>}
          </Link>
        ))}
      </nav>

      <form className="row" method="get" style={{ marginBottom: 12 }}>
        <input type="hidden" name="dossier" value={folder} />
        <input type="search" name="q" defaultValue={sp.q} placeholder="Chercher un nom, une adresse, un mot…" style={{ flex: 1, minWidth: 200 }} />
        <button className="btn secondary">Chercher</button>
      </form>

      {sp.envoye && <p className="success">Message en cours d&apos;envoi depuis votre Gmail.</p>}
      {pending.filter((p) => p.status !== "failed").length > 0 && (
        <p className="muted small">{pending.filter((p) => p.status !== "failed").length} message(s) en cours d&apos;envoi…</p>
      )}
      {pending
        .filter((p) => p.status === "failed")
        .map((p) => (
          <p key={p.id} className="notice">
            Le message à {p.toEmail} (« {p.subject} ») n&apos;a pas pu partir : {p.lastError ?? "erreur inconnue"}.
          </p>
        ))}

      {state?.lastError && (
        <p className="notice">Dernière relève Gmail impossible : {state.lastError}. Nouvel essai dans une minute.</p>
      )}
      {!state && <p className="notice">Première relève de votre Gmail en cours. Vos emails apparaîtront dans une minute environ.</p>}
      {state && !state.backfillDone && (
        <p className="muted small">Recopie de vos emails des 12 derniers mois en cours. Les plus récents sont déjà là.</p>
      )}

      {Number(sp.supprime) > 0 && (
        <p className="success">
          {Number(sp.supprime)} conversation(s) mise(s) dans la corbeille de Gmail. En cas d&apos;erreur, vous la retrouvez dans la Corbeille de Gmail pendant 30 jours.
        </p>
      )}
      {Number(sp.lus) > 0 && <p className="success">{Number(sp.lus)} conversation(s) marquée(s) comme lue(s).</p>}
      {folder === "nonlus" && threads.length > 0 && (
        <p className="muted small">Les emails non lus de votre boîte de réception. Une conversation quitte cette liste dès que vous l&apos;ouvrez.</p>
      )}
      {threads.length === 0 ? (
        <div className="card threads">
          <p className="muted">{sp.q ? "Aucun message ne correspond à cette recherche." : folder === "nonlus" ? "Bravo, tout est lu ! Aucun email en attente." : "Aucun message pour l'instant."}</p>
        </div>
      ) : (
        <ThreadList
          folder={folder}
          rows={threads.map((t) => ({
            threadId: t.threadId,
            who: `${t.outgoingLast && folder !== "envoyes" ? "Moi, " : ""}${t.people.join(", ") || "Moi"}`,
            count: t.count,
            subject: t.subject,
            snippet: t.snippet,
            when: shortDate(t.lastDate),
            unseen: t.unseen > 0,
          }))}
        />
      )}
      <div className="row">
        {page > 1 && <Link className="btn secondary" href={link({ page: page - 1 })}>← Plus récents</Link>}
        {hasMore && <Link className="btn secondary" href={link({ page: page + 1 })}>Plus anciens →</Link>}
      </div>
      {state?.lastSyncAt && (
        <p className="muted small">Dernière relève : {state.lastSyncAt.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris" })}</p>
      )}
    </>
  );
}
