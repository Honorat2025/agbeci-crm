import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { env } from "@/lib/env";
import { todayParis } from "@/lib/prospection";
import {
  calendarItems,
  calendarToken,
  dayLabel,
  isDay,
  isMonth,
  monthLabel,
  monthWeeks,
  shiftDay,
  shiftMonth,
  shortDayLabel,
  weekDays,
  type CalItem,
} from "@/lib/calendar";
import { newFeedLink } from "./actions";
import { CopyField } from "./copy-field";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const KIND_LABEL: Record<CalItem["kind"], string> = { event: "Rendez-vous", visio: "Visio", task: "Rappel" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ mois?: string; jour?: string; vue?: string; lien?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayParis();
  const week = sp.vue === "semaine";
  const selected = isDay(sp.jour) ? sp.jour : today;
  const month = isMonth(sp.mois) ? sp.mois : selected.slice(0, 7);
  const weeks = week ? [weekDays(selected)] : monthWeeks(month);
  const from = weeks[0]![0]!;
  const to = weeks[weeks.length - 1]![6]!;
  const [items, token] = await Promise.all([calendarItems(from, to), calendarToken()]);
  const dayItems = items.get(selected) ?? [];
  const feedUrl = `${env.appUrl}/api/calendrier/${token}.ics`;

  const prev = week ? `?vue=semaine&jour=${shiftDay(selected, -7)}` : `?mois=${shiftMonth(month, -1)}`;
  const next = week ? `?vue=semaine&jour=${shiftDay(selected, 7)}` : `?mois=${shiftMonth(month, 1)}`;
  const title = week ? `Semaine du ${dayLabel(weeks[0]![0]!).toLowerCase()}` : monthLabel(month);
  const dayHref = (d: string) => (week ? `?vue=semaine&jour=${d}` : `?mois=${month}&jour=${d}`);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Calendrier</h1>
        <Link className="btn" href={`/app/calendrier/nouveau?jour=${selected}`}>Nouveau rendez-vous</Link>
      </div>

      <div className="cal-toolbar">
        <div className="cal-nav">
          <Link className="btn secondary" href={prev} aria-label="Période précédente">‹</Link>
          <Link className="btn secondary" href={week ? `?vue=semaine&jour=${today}` : `?mois=${today.slice(0, 7)}&jour=${today}`}>Aujourd&apos;hui</Link>
          <Link className="btn secondary" href={next} aria-label="Période suivante">›</Link>
          <h2 className="cal-title">{title}</h2>
        </div>
        <div className="cal-views">
          <Link href={`?mois=${selected.slice(0, 7)}&jour=${selected}`} className={week ? "" : "active"}>Mois</Link>
          <Link href={`?vue=semaine&jour=${selected}`} className={week ? "active" : ""}>Semaine</Link>
        </div>
      </div>

      <div className={`cal ${week ? "cal-week" : "cal-month"}`}>
        {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
        {weeks.flat().map((d) => {
          const list = items.get(d) ?? [];
          const outside = !week && d.slice(0, 7) !== month;
          const max = week ? 12 : 3;
          return (
            <div key={d} className={["cal-day", outside && "outside", d === today && "today", d === selected && "selected"].filter(Boolean).join(" ")}>
              <Link href={dayHref(d)} className="cal-num" aria-label={dayLabel(d)}>{week ? shortDayLabel(d) : Number(d.slice(8))}</Link>
              {list.length > 0 && <span className="cal-dots" aria-hidden="true">{list.slice(0, 4).map((i) => <i key={i.key} className={i.kind} />)}</span>}
              <ul className="cal-items">
                {list.slice(0, max).map((i) => (
                  <li key={i.key} className={`${i.kind}${i.done ? " done" : ""}`}>
                    <Link href={i.href} title={[i.time, i.title, i.detail].filter(Boolean).join(" · ")}>
                      {i.time && <b>{i.time.replace(" h ", "h")}</b>} {i.title}
                    </Link>
                  </li>
                ))}
                {list.length > max && <li className="more"><Link href={dayHref(d)}>+ {list.length - max} autre(s)</Link></li>}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="cal-legend muted small">
        <span><i className="event" /> Rendez-vous</span> <span><i className="visio" /> Visio</span> <span><i className="task" /> Rappel</span>
      </p>

      <div className="card cal-dayview">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>{dayLabel(selected)}</h2>
          <Link href={`/app/calendrier/nouveau?jour=${selected}`}>+ Ajouter ce jour</Link>
        </div>
        {dayItems.length === 0 ? (
          <p className="muted">Rien de prévu ce jour-là.</p>
        ) : (
          <ul className="agenda">
            {dayItems.map((i) => (
              <li key={i.key} className={`${i.kind}${i.done ? " done" : ""}`}>
                <span className="agenda-time">{i.time ?? (i.kind === "task" ? "Rappel" : "Journée")}</span>
                <span>
                  <Link href={i.href}>{i.title}</Link>
                  <span className="muted small">{i.kind === "task" ? "" : ` · ${KIND_LABEL[i.kind]}`}{i.done ? " (fait)" : ""}{i.detail ? ` · ${i.detail}` : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="card" id="agenda" open={sp.lien === "nouveau"}>
        <summary>Voir ce calendrier dans Google Agenda ou sur le téléphone</summary>
        {sp.lien === "nouveau" && <p className="success">Nouveau lien créé. L&apos;ancien ne fonctionne plus : ajoutez celui-ci à la place.</p>}
        <p>Vos rendez-vous, visios et rappels s&apos;affichent aussi dans votre agenda habituel. Ils se modifient seulement ici, dans le CRM.</p>
        <CopyField value={feedUrl} />
        <p><strong>Google Agenda</strong> (sur l&apos;ordinateur) : ouvrez <a href="https://calendar.google.com/calendar/r/settings/addbyurl" target="_blank" rel="noopener noreferrer">cette page de Google Agenda</a>, collez le lien ci-dessus, puis cliquez sur « Ajouter l&apos;agenda ». Il apparaîtra ensuite aussi sur votre téléphone Android. Google met à jour l&apos;agenda toutes les quelques heures : un changement n&apos;y apparaît donc pas tout de suite.</p>
        <p><strong>iPhone</strong> : Réglages &gt; Calendrier &gt; Comptes &gt; Ajouter un compte &gt; Autre &gt; « Ajouter un calendrier avec abonnement », puis collez le lien.</p>
        <p className="muted small">Ce lien est personnel : toute personne qui le connaît peut voir votre calendrier. Si vous l&apos;avez donné par erreur, créez-en un nouveau.</p>
        <form action={newFeedLink}><button className="btn secondary">Créer un nouveau lien</button></form>
      </details>
    </>
  );
}
