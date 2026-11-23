import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guard";
import { EVENT_DURATIONS, getEvent } from "@/lib/calendar";
import { todayParis } from "@/lib/prospection";
import { contactOptions } from "../../../prospection/options";
import { removeEvent } from "../../actions";
import { EventForm } from "../../forms";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const ev = Number.isInteger(id) ? await getEvent(id) : null;
  if (!ev) notFound();
  const day = todayParis(ev.startsAt);
  const time = ev.startsAt.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  const contacts = await contactOptions();
  return (
    <>
      <p><Link href={`/app/calendrier?mois=${day.slice(0, 7)}&jour=${day}`}>← Calendrier</Link></p>
      <h1>{ev.title}</h1>
      <p className="row">
        {ev.contactId && <Link href={`/app/contacts/${ev.contactId}`}>Voir la fiche du contact</Link>}
        {ev.mailThreadId && <Link href={`/app/messages/${encodeURIComponent(ev.mailThreadId)}`}>Voir la conversation</Link>}
      </p>
      <div className="card">
        <EventForm
          initial={{
            id: ev.id,
            title: ev.title,
            conversation: ev.mailThreadId ?? "",
            day,
            time: ev.allDay ? "10:00" : time,
            allDay: ev.allDay,
            duration: String((EVENT_DURATIONS as readonly number[]).includes(ev.durationMin) ? ev.durationMin : 60),
            place: ev.place ?? "",
            notes: ev.notes ?? "",
            contactId: ev.contactId ? String(ev.contactId) : "",
          }}
          contacts={contacts}
          durations={EVENT_DURATIONS}
        />
      </div>
      <details className="card">
        <summary>Supprimer ce rendez-vous</summary>
        <form action={removeEvent}>
          <input type="hidden" name="id" value={ev.id} />
          <input type="hidden" name="month" value={day.slice(0, 7)} />
          <p>Le rendez-vous disparaîtra du calendrier.</p>
          <button className="btn danger">Supprimer</button>
        </form>
      </details>
    </>
  );
}
