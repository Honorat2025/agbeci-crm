import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { exchangeStats, getContact, listNotes, NOTE_CHANNELS } from "@/lib/contacts";
import { whatsappLink, whatsappNumber } from "@/lib/whatsapp";
import { listThreads, shortDate } from "@/lib/messages";
import { addDays, formatAmount, KIND_LABELS, listOpportunities, openTasks, STAGE_LABELS, todayParis } from "@/lib/prospection";
import { removeNote } from "../actions";
import { ContactForm, NoteForm } from "../forms";
import { toggleNoBulk } from "../../prospection/actions";
import { TaskForm } from "../../prospection/forms";
import { TaskList } from "../../prospection/task-list";
import { DEFAULT_INVITE, DURATIONS, upcomingMeetings } from "@/lib/meetings";
import { MeetingForm } from "../../visios/forms";
import { MeetingList } from "../../visios/meeting-list";

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
  const [notes, stats, { threads }, deals, tasks, visios] = await Promise.all([
    listNotes(id),
    exchangeStats(c.email),
    listThreads({ folder: "tous", participant: c.email }),
    listOpportunities({ contactId: id }),
    openTasks({ contactId: id }),
    upcomingMeetings({ contactId: id }),
  ]);
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;
  const wa = whatsappNumber(c.phone, c.country);

  return (
    <>
      <p><Link href="/app/contacts">← Contacts</Link></p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{name}</h1>
        <div className="row">
          {wa && (
            <a className="btn whatsapp" href={whatsappLink(wa)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          )}
          <Link className="btn" href={`/app/messages/nouveau?a=${encodeURIComponent(c.email)}`}>Écrire</Link>
        </div>
      </div>
      {c.phone && !wa && (
        <p className="notice small">
          Le bouton WhatsApp apparaîtra quand le numéro sera au format international (par exemple +225 07 12 34 56 78), ou quand le pays sera indiqué dans les coordonnées.
        </p>
      )}
      <p className="muted">
        {c.email} · {NEWSLETTER[c.newsletterStatus]} · Fiche créée le {c.createdAt.toLocaleDateString("fr-FR")}
        {stats.count > 0 && stats.last && <> · {stats.count} email(s) échangé(s), le dernier le {stats.last.toLocaleDateString("fr-FR")}</>}
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Visios</h2>
        <MeetingList rows={visios} showWho={false} />
        <div style={{ marginTop: visios.length ? 12 : 0 }}>
          <MeetingForm contactId={c.id} defaultTitle="Consultation" defaultDay={addDays(todayParis(), 2)} defaultMessage={DEFAULT_INVITE} durations={DURATIONS} />
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Rappels</h2>
        <TaskList rows={tasks} showLinks={false} empty="Aucun rappel prévu avec cette personne." />
        <div style={{ marginTop: 12 }}>
          <TaskForm defaultDue={addDays(todayParis(), 3)} contactId={c.id} />
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Affaires</h2>
          <Link className="btn secondary" href={`/app/prospection/nouvelle?contact=${c.id}`}>Nouvelle affaire</Link>
        </div>
        {deals.length === 0 ? (
          <p className="muted">Aucune affaire avec cette personne.</p>
        ) : (
          <table style={{ marginTop: 12 }}>
            <tbody>
              {deals.map(({ o }) => (
                <tr key={o.id}>
                  <td><Link href={`/app/prospection/${o.id}`}>{o.title}</Link></td>
                  <td className="muted">{KIND_LABELS[o.kind]}</td>
                  <td>{STAGE_LABELS[o.stage]}</td>
                  <td>{formatAmount(o.amount, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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

      <form action={toggleNoBulk} className="row small muted" style={{ margin: "-4px 0 16px" }}>
        <input type="hidden" name="contactId" value={c.id} />
        <input type="hidden" name="value" value={c.noBulk ? "0" : "1"} />
        {c.noBulk ? (
          <>Cette personne ne reçoit pas les envois groupés. <button className="linkbtn">L&apos;inclure à nouveau</button></>
        ) : (
          <>Cette personne peut recevoir les envois groupés de ses étiquettes. <button className="linkbtn">Ne plus l&apos;inclure</button></>
        )}
      </form>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Notes et échanges</h2>
          <Link className="btn secondary" href={`/app/calendrier/nouveau?${new URLSearchParams({ contact: String(c.id), titre: `Rendez-vous avec ${name}` }).toString()}`}>
            📅 Ajouter au calendrier
          </Link>
        </div>
        <NoteForm contactId={c.id} />
        {notes.map((n) => (
          <div key={n.id} className="note">
            {n.channel !== "note" && <span className={`badge ${n.channel}`}>{NOTE_CHANNELS[n.channel]}</span>}
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
        <h2 style={{ marginTop: 0 }}>Emails échangés</h2>
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
