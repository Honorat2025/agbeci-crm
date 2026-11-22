import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { exchangeStats, getContact, listNotes } from "@/lib/contacts";
import { listThreads, shortDate } from "@/lib/messages";
import { removeNote } from "../actions";
import { ContactForm, NoteForm } from "../forms";

const NEWSLETTER: Record<string, string> = {
  none: "Pas abonné à la newsletter",
  pending: "Inscription à la newsletter en attente de confirmation",
  subscribed: "Abonné à la newsletter",
  unsubscribed: "Désinscrit de la newsletter",
  bounced: "Adresse en erreur",
};

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const c = await getContact(id);
  if (!c) notFound();
  const [notes, stats, { threads }] = await Promise.all([listNotes(id), exchangeStats(c.email), listThreads({ folder: "tous", participant: c.email })]);
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;

  return (
    <>
      <p><Link href="/app/contacts">← Contacts</Link></p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{name}</h1>
        <Link className="btn" href={`/app/messages/nouveau?a=${encodeURIComponent(c.email)}`}>Écrire</Link>
      </div>
      <p className="muted">
        {c.email} · {NEWSLETTER[c.newsletterStatus]} · Fiche créée le {c.createdAt.toLocaleDateString("fr-FR")}
        {stats.count > 0 && stats.last && <> · {stats.count} email(s) échangé(s), le dernier le {stats.last.toLocaleDateString("fr-FR")}</>}
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Coordonnées</h2>
        <ContactForm
          initial={{
            id: c.id,
            firstName: c.firstName ?? "",
            lastName: c.lastName ?? "",
            company: c.company ?? "",
            jobTitle: c.jobTitle ?? "",
            phone: c.phone ?? "",
            country: c.country ?? "",
            tags: c.tags.join(", "),
          }}
        />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Notes</h2>
        <NoteForm contactId={c.id} />
        {notes.map((n) => (
          <div key={n.id} className="note">
            <div className="plain">{n.body}</div>
            <div className="row muted small" style={{ justifyContent: "space-between" }}>
              <span>{n.createdAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" })}</span>
              <form action={removeNote}>
                <input type="hidden" name="noteId" value={n.id} />
                <input type="hidden" name="contactId" value={c.id} />
                <button className="linkbtn">Supprimer</button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <div className="card threads compact">
        <h2 style={{ marginTop: 0 }}>Échanges</h2>
        {threads.length === 0 ? (
          <p className="muted">Aucun email avec cette personne dans les 12 derniers mois.</p>
        ) : (
          <ul>
            {threads.map((t) => (
              <li key={t.threadId} className={t.unseen > 0 ? "unseen" : undefined}>
                <Link prefetch={false} href={`/app/messages/${encodeURIComponent(t.threadId)}`}>
                  <span className="what"><strong>{t.subject}</strong><span className="muted"> — {t.snippet}</span></span>
                  <span className="when muted">{shortDate(t.lastDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
