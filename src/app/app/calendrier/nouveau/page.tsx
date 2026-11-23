import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { EVENT_DURATIONS, isDay } from "@/lib/calendar";
import { todayParis } from "@/lib/prospection";
import { contactOptions } from "../../prospection/options";
import { EventForm } from "../forms";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ jour?: string; contact?: string; titre?: string; conversation?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const day = isDay(sp.jour) ? sp.jour : todayParis();
  const contacts = await contactOptions();
  return (
    <>
      <p><Link href={`/app/calendrier?mois=${day.slice(0, 7)}&jour=${day}`}>← Calendrier</Link></p>
      <h1>Nouveau rendez-vous</h1>
      {sp.conversation && <p className="muted">Le rendez-vous gardera un lien vers la conversation.</p>}
      <p className="muted">Pour une visio avec un contact, passez plutôt par sa fiche : l&apos;invitation part alors automatiquement.</p>
      <div className="card">
        <EventForm
          initial={{ id: null, title: (sp.titre ?? "").slice(0, 150), conversation: (sp.conversation ?? "").slice(0, 200), day, time: "10:00", allDay: false, duration: "60", place: "", notes: "", contactId: /^\d+$/.test(sp.contact ?? "") ? sp.contact! : "" }}
          contacts={contacts}
          durations={EVENT_DURATIONS}
        />
      </div>
    </>
  );
}
