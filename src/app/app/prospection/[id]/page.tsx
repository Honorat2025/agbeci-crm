import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { getContact } from "@/lib/contacts";
import { addDays, getOpportunity, KIND_LABELS, openTasks, STAGE_LABELS, todayParis } from "@/lib/prospection";
import { removeOpportunity } from "../actions";
import { OpportunityForm, TaskForm } from "../forms";
import { contactOptions, CURRENCIES, kindOptions, stageOptions } from "../options";
import { TaskList } from "../task-list";
import { DEFAULT_INVITE, DURATIONS, upcomingMeetings } from "@/lib/meetings";
import { MeetingForm } from "../../visios/forms";
import { MeetingList } from "../../visios/meeting-list";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const o = await getOpportunity(id);
  if (!o) notFound();
  const [contact, contacts, tasks, visios] = await Promise.all([
    o.contactId ? getContact(o.contactId) : null,
    contactOptions(),
    openTasks({ opportunityId: id }),
    upcomingMeetings({ opportunityId: id }),
  ]);
  const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email : null;

  return (
    <>
      <p><Link href="/app/prospection">← Prospection</Link></p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{o.title}</h1>
        {contact && <Link className="btn" href={`/app/messages/nouveau?a=${encodeURIComponent(contact.email)}`}>Écrire à {contact.firstName ?? contactName}</Link>}
      </div>
      <p className="muted">
        {KIND_LABELS[o.kind]} · {STAGE_LABELS[o.stage]}
        {contact && <> · <Link href={`/app/contacts/${contact.id}`}>{contactName}</Link></>}
        {" "}· Créée le {o.createdAt.toLocaleDateString("fr-FR")}
        {o.closedAt && <> · Terminée le {o.closedAt.toLocaleDateString("fr-FR")}</>}
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Visios</h2>
        <MeetingList rows={visios} showWho={false} />
        {contact ? (
          <div style={{ marginTop: visios.length ? 12 : 0 }}>
            <MeetingForm contactId={contact.id} opportunityId={o.id} defaultTitle={o.title} defaultDay={addDays(todayParis(), 2)} defaultMessage={DEFAULT_INVITE} durations={DURATIONS} />
          </div>
        ) : (
          <p className="muted">Choisissez un contact dans les détails de l&apos;affaire pour pouvoir l&apos;inviter en visio.</p>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Rappels</h2>
        <TaskList rows={tasks} showLinks={false} empty="Aucun rappel prévu pour cette affaire." />
        <div style={{ marginTop: 12 }}>
          <TaskForm defaultDue={addDays(todayParis(), 3)} opportunityId={o.id} contactId={o.contactId ?? undefined} />
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Détails</h2>
        <OpportunityForm
          kinds={kindOptions}
          stages={stageOptions}
          currencies={CURRENCIES}
          contacts={contacts}
          initial={{
            id: o.id,
            title: o.title,
            kind: o.kind,
            stage: o.stage,
            contactId: o.contactId ? String(o.contactId) : "",
            organization: o.organization ?? "",
            country: o.country ?? "",
            amount: o.amount === null ? "" : String(o.amount),
            currency: o.currency,
            source: o.source ?? "",
            notes: o.notes,
          }}
        />
      </div>

      <details>
        <summary className="muted">Supprimer cette affaire</summary>
        <form action={removeOpportunity} style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={o.id} />
          <p className="muted small">L&apos;affaire et ses rappels seront effacés. La fiche du contact reste. Pour garder une trace, choisissez plutôt l&apos;étape « Perdue ».</p>
          <button className="btn danger">Supprimer définitivement</button>
        </form>
      </details>
    </>
  );
}
