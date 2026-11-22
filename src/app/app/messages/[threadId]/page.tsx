import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/guard";
import { blockRemoteImages, markThreadSeen } from "@/lib/mailbox";
import { formatDate, getThread, replyTarget } from "@/lib/messages";
import { getMailSettings } from "@/lib/settings";
import { ReplyForm } from "../compose-forms";
import { EmailFrame } from "../email-frame";
import { createContactFromAddress } from "../../contacts/actions";

function sizeLabel(bytes: number) {
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1000))} ko`;
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ images?: string }>;
}) {
  await requireAdmin();
  const { threadId: raw } = await params;
  const { images } = await searchParams;
  const threadId = decodeURIComponent(raw);
  const thread = await getThread(threadId);
  if (!thread.length) notFound();
  await markThreadSeen(threadId);

  const own = (await getMailSettings()).address.toLowerCase();
  const people = [...new Set(thread.flatMap((m) => m.participants))].filter((a) => a !== own);
  const known = people.length
    ? await getDb().select({ id: schema.contacts.id, email: schema.contacts.email }).from(schema.contacts).where(inArray(schema.contacts.email, people))
    : [];
  const knownMap = new Map(known.map((k) => [k.email, k.id]));
  const nameOf = new Map<string, string>();
  for (const m of thread) {
    if (m.fromName) nameOf.set(m.fromEmail, m.fromName);
    for (const a of [...m.to, ...m.cc]) if (a.name && !nameOf.has(a.address)) nameOf.set(a.address, a.name);
  }

  const to = replyTarget(thread, own);
  const last = thread.at(-1)!;
  const cc = [...last.to, ...last.cc]
    .map((a) => a.address)
    .filter((a) => a !== own && a !== to)
    .join(", ");
  const allowImages = images === "1";

  return (
    <>
      <p><Link href="/app/messages">← Messagerie</Link></p>
      <h1>{thread[0]!.subject || "(sans objet)"}</h1>

      <div className="card">
        <strong>Personnes dans cette conversation</strong>
        <ul className="people">
          {people.map((p) => (
            <li key={p}>
              {nameOf.get(p) ? `${nameOf.get(p)} <${p}>` : p}{" "}
              {knownMap.has(p) ? (
                <Link href={`/app/contacts/${knownMap.get(p)}`}>Voir la fiche</Link>
              ) : (
                <form action={createContactFromAddress} style={{ display: "inline" }}>
                  <input type="hidden" name="email" value={p} />
                  <input type="hidden" name="name" value={nameOf.get(p) ?? ""} />
                  <input type="hidden" name="back" value={`/app/messages/${encodeURIComponent(threadId)}`} />
                  <button className="linkbtn">Créer une fiche</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>

      {thread.map((m) => {
        const body = m.htmlBody ? (allowImages ? { html: m.htmlBody, blocked: 0 } : blockRemoteImages(m.htmlBody)) : null;
        return (
          <article key={m.id} className={`card message${m.outgoing ? " mine" : ""}`}>
            <header className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{m.outgoing ? "Moi" : m.fromName || m.fromEmail}</strong>{" "}
                {!m.outgoing && m.fromName && <span className="muted small">&lt;{m.fromEmail}&gt;</span>}
                <div className="muted small">
                  À : {m.to.map((a) => a.name || a.address).join(", ") || "—"}
                  {m.cc.length > 0 && <> · Copie : {m.cc.map((a) => a.name || a.address).join(", ")}</>}
                </div>
              </div>
              <span className="muted small">{formatDate(m.date)}</span>
            </header>
            {body ? (
              <>
                {body.blocked > 0 && (
                  <p className="muted small">
                    Images masquées pour protéger votre vie privée.{" "}
                    <Link href={`/app/messages/${encodeURIComponent(threadId)}?images=1`}>Afficher les images</Link>
                  </p>
                )}
                <EmailFrame html={body.html} allowImages={allowImages} />
              </>
            ) : (
              <div className="plain">{m.textBody || <span className="muted">(message vide)</span>}</div>
            )}
            {m.attachments.length > 0 && (
              <p className="muted small">
                Pièces jointes : {m.attachments.map((a) => `${a.filename} (${sizeLabel(a.size)})`).join(", ")}. Ouvrez-les dans Gmail.
              </p>
            )}
          </article>
        );
      })}

      <ReplyForm threadId={threadId} to={to} cc={cc} />
    </>
  );
}
