/**
 * Calendrier : rendez-vous personnels, visios et rappels réunis par jour (heure de Paris),
 * et flux iCalendar (.ics) pour les voir dans Google Agenda ou sur le téléphone.
 */
import { and, asc, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { randomToken } from "./crypto";
import { meetingUrl, parisToDate } from "./meetings";
import { todayParis } from "./prospection";

const { events, meetings, tasks, contacts, opportunities, settings } = schema;

export const EVENT_DURATIONS = [30, 60, 90, 120, 180] as const;

/* ------------------------------ Jours et mois ------------------------------ */

const utc = (day: string) => new Date(`${day}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function isDay(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(utc(v).getTime()) && iso(utc(v)) === v;
}

export function isMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftDay(day: string, n: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return iso(d).slice(0, 7);
}

/** Lundi de la semaine qui contient ce jour. */
export function mondayOf(day: string): string {
  const dow = (utc(day).getUTCDay() + 6) % 7; // lundi = 0
  return shiftDay(day, -dow);
}

export function weekDays(day: string): string[] {
  const start = mondayOf(day);
  return Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
}

/** Semaines (lundi → dimanche) qui couvrent le mois, jours des mois voisins compris. */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const last = shiftDay(`${shiftMonth(month, 1)}-01`, -1);
  const weeks: string[][] = [];
  for (let d = mondayOf(first); d <= last; d = shiftDay(d, 7)) weeks.push(weekDays(d));
  return weeks;
}

/** Majuscule au premier mot seulement, comme en français (« Jeudi 26 novembre »). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const label = (day: string, opts: Intl.DateTimeFormatOptions) => cap(utc(day).toLocaleDateString("fr-FR", { timeZone: "UTC", ...opts }));
export const monthLabel = (month: string) => label(`${month}-01`, { month: "long", year: "numeric" });
export const dayLabel = (day: string) => label(day, { weekday: "long", day: "numeric", month: "long" });
export const shortDayLabel = (day: string) => label(day, { weekday: "short", day: "numeric" });

const hm = (d: Date) => d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
const hhmm = (d: Date) => d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

/* ------------------------------ Contenu du calendrier ------------------------------ */

export type CalItem = {
  kind: "event" | "visio" | "task";
  key: string;
  day: string;
  /** « 15 h 00 », ou null pour la journée entière et les rappels. */
  time: string | null;
  title: string;
  detail: string | null;
  href: string;
  done: boolean;
};

const fullName = (c: { firstName: string | null; lastName: string | null; email: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || null;

/** Tout ce qui tombe entre deux jours inclus, groupé par jour. */
export async function calendarItems(from: string, to: string): Promise<Map<string, CalItem[]>> {
  // Bornes larges en UTC, puis tri exact sur le jour de Paris.
  const start = new Date(utc(from).getTime() - 3 * 3600_000);
  const end = new Date(utc(to).getTime() + 27 * 3600_000);
  const db = getDb();
  const [evs, visios, todos] = await Promise.all([
    db
      .select({ e: events, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
      .from(events)
      .leftJoin(contacts, eq(contacts.id, events.contactId))
      .where(and(gte(events.startsAt, start), lt(events.startsAt, end)))
      .orderBy(asc(events.startsAt)),
    db
      .select({ m: meetings, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
      .from(meetings)
      .innerJoin(contacts, eq(contacts.id, meetings.contactId))
      .where(and(isNull(meetings.canceledAt), gte(meetings.startsAt, start), lt(meetings.startsAt, end)))
      .orderBy(asc(meetings.startsAt)),
    db
      .select({ t: tasks, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, opportunityTitle: opportunities.title })
      .from(tasks)
      .leftJoin(contacts, eq(contacts.id, tasks.contactId))
      .leftJoin(opportunities, eq(opportunities.id, tasks.opportunityId))
      .where(and(gte(tasks.dueOn, from), lte(tasks.dueOn, to)))
      .orderBy(asc(tasks.dueOn), asc(tasks.id)),
  ]);
  // Le rappel créé automatiquement avec une visio ferait doublon.
  const visioTasks = new Set(visios.map((v) => v.m.taskId).filter((x): x is number => x !== null));

  const items: (CalItem & { sort: string })[] = [];
  for (const r of evs) {
    const day = todayParis(r.e.startsAt);
    items.push({
      kind: "event",
      key: `e${r.e.id}`,
      day,
      time: r.e.allDay ? null : hm(r.e.startsAt),
      title: r.e.title,
      detail: [r.e.place, fullName(r)].filter(Boolean).join(" · ") || null,
      href: `/app/calendrier/rdv/${r.e.id}`,
      done: false,
      sort: r.e.allDay ? "0" : `1${hhmm(r.e.startsAt)}`,
    });
  }
  for (const r of visios) {
    items.push({
      kind: "visio",
      key: `v${r.m.id}`,
      day: todayParis(r.m.startsAt),
      time: hm(r.m.startsAt),
      title: `Visio : ${r.m.title}`,
      detail: fullName(r),
      href: `/app/contacts/${r.m.contactId}`,
      done: false,
      sort: `1${hhmm(r.m.startsAt)}`,
    });
  }
  for (const r of todos) {
    if (visioTasks.has(r.t.id)) continue;
    items.push({
      kind: "task",
      key: `t${r.t.id}`,
      day: r.t.dueOn,
      time: null,
      title: r.t.title,
      detail: [fullName(r), r.opportunityTitle].filter(Boolean).join(" · ") || null,
      href: r.t.opportunityId ? `/app/prospection/${r.t.opportunityId}` : r.t.contactId ? `/app/contacts/${r.t.contactId}` : "/app/rappels",
      done: r.t.doneAt !== null,
      sort: "2",
    });
  }
  const byDay = new Map<string, CalItem[]>();
  for (const it of items.filter((i) => i.day >= from && i.day <= to).sort((a, b) => a.sort.localeCompare(b.sort))) {
    const { sort: _sort, ...item } = it;
    byDay.set(it.day, [...(byDay.get(it.day) ?? []), item]);
  }
  return byDay;
}

/* ------------------------------ Rendez-vous ------------------------------ */

export type EventInput = {
  title: string;
  day: string;
  time: string;
  allDay: boolean;
  durationMin: number;
  place: string;
  notes: string;
  contactId: number | null;
  mailThreadId?: string;
};

/** Vérifie la saisie ; renvoie un message d'erreur en français ou les valeurs à enregistrer. */
export function parseEventInput(input: EventInput): { error: string } | { values: Omit<typeof events.$inferInsert, "id" | "createdAt"> } {
  const title = input.title.trim().slice(0, 150);
  if (!title) return { error: "Donnez un titre au rendez-vous." };
  if (!isDay(input.day)) return { error: "Choisissez le jour." };
  const startsAt = parisToDate(input.day, input.allDay ? "00:00" : input.time);
  if (!startsAt) return { error: "Choisissez l'heure, ou cochez « Toute la journée »." };
  if (!input.allDay && !(EVENT_DURATIONS as readonly number[]).includes(input.durationMin)) return { error: "Choisissez une durée." };
  return {
    values: {
      title,
      startsAt,
      allDay: input.allDay,
      durationMin: input.allDay ? 24 * 60 : input.durationMin,
      place: input.place.trim().slice(0, 200) || null,
      notes: input.notes.trim().slice(0, 5000) || null,
      contactId: input.contactId,
      mailThreadId: input.mailThreadId?.trim().slice(0, 200) || null,
    },
  };
}

export async function getEvent(id: number) {
  const [row] = await getDb().select().from(events).where(eq(events.id, id));
  return row ?? null;
}

export async function createEvent(values: Omit<typeof events.$inferInsert, "id" | "createdAt">) {
  const [row] = await getDb().insert(events).values(values).returning({ id: events.id });
  return row!.id;
}

export async function updateEvent(id: number, values: Omit<typeof events.$inferInsert, "id" | "createdAt">) {
  await getDb().update(events).set(values).where(eq(events.id, id));
}

export async function deleteEvent(id: number) {
  await getDb().delete(events).where(eq(events.id, id));
}

/** Rendez-vous du jour (heure de Paris), pour l'email du matin. */
export async function eventsOfDay(day: string) {
  return (await calendarItems(day, day)).get(day)?.filter((i) => i.kind === "event") ?? [];
}

/* ------------------------------ Abonnement (.ics) ------------------------------ */

const KEY_TOKEN = "calendar_feed_token";

/** Jeton secret de l'adresse d'abonnement, créé à la première demande. */
export async function calendarToken(): Promise<string> {
  const db = getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY_TOKEN));
  if (row) return row.value;
  const value = randomToken(24).replace(/[^A-Za-z0-9]/g, "");
  await db.insert(settings).values({ key: KEY_TOKEN, value }).onConflictDoNothing();
  const [again] = await db.select().from(settings).where(eq(settings.key, KEY_TOKEN));
  return again!.value;
}

/** Nouveau lien : l'ancien cesse aussitôt de fonctionner. */
export async function resetCalendarToken(): Promise<void> {
  const value = randomToken(24).replace(/[^A-Za-z0-9]/g, "");
  await getDb()
    .insert(settings)
    .values({ key: KEY_TOKEN, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function checkCalendarToken(token: string): Promise<boolean> {
  if (!token || token.length < 16) return false;
  const [row] = await getDb().select().from(settings).where(eq(settings.key, KEY_TOKEN));
  if (!row) return false;
  const a = Buffer.from(row.value);
  const b = Buffer.from(token);
  return a.length === b.length && (await import("node:crypto")).timingSafeEqual(a, b);
}

/** Texte iCalendar : échappement et lignes de 75 octets au plus (RFC 5545). */
export function icsText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (day: string) => day.replace(/-/g, "");

export type IcsEntry = {
  uid: string;
  title: string;
  /** Instant de début, ou jour entier (AAAA-MM-JJ). */
  start: Date | string;
  durationMin: number;
  place?: string | null;
  description?: string | null;
  url?: string | null;
};

export function buildIcs(entries: IcsEntry[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Agbeci CRM//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Agbeci CRM", "X-WR-TIMEZONE:Europe/Paris", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of entries) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`);
    if (typeof e.start === "string") {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`, `DTEND;VALUE=DATE:${dateOnly(shiftDay(e.start, 1))}`, "TRANSP:TRANSPARENT");
    } else {
      lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(new Date(e.start.getTime() + e.durationMin * 60000))}`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.place) lines.push(`LOCATION:${icsText(e.place)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Le flux : 2 mois en arrière, 1 an en avant. Rappels faits exclus. */
export async function feedEntries(appUrl: string, now = new Date()): Promise<IcsEntry[]> {
  const host = new URL(appUrl).host;
  const today = todayParis(now);
  const from = shiftDay(today, -62);
  const to = shiftDay(today, 366);
  const start = new Date(utc(from).getTime() - 3 * 3600_000);
  const end = new Date(utc(to).getTime() + 27 * 3600_000);
  const db = getDb();
  const [evs, visios, todos] = await Promise.all([
    db.select().from(events).where(and(gte(events.startsAt, start), lt(events.startsAt, end))),
    db
      .select({ m: meetings, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
      .from(meetings)
      .innerJoin(contacts, eq(contacts.id, meetings.contactId))
      .where(and(isNull(meetings.canceledAt), gte(meetings.startsAt, start), lt(meetings.startsAt, end))),
    db.select().from(tasks).where(and(isNull(tasks.doneAt), gte(tasks.dueOn, from), lte(tasks.dueOn, to))),
  ]);
  const visioTasks = new Set(visios.map((v) => v.m.taskId).filter((x): x is number => x !== null));
  return [
    ...evs.map((e) => ({
      uid: `rdv-${e.id}@${host}`,
      title: e.title,
      start: e.allDay ? todayParis(e.startsAt) : e.startsAt,
      durationMin: e.durationMin,
      place: e.place,
      description: e.notes,
      url: `${appUrl}/app/calendrier/rdv/${e.id}`,
    })),
    ...visios.map((v) => {
      const url = meetingUrl(v.m);
      return {
        uid: `visio-${v.m.id}@${host}`,
        title: `Visio : ${v.m.title} (${fullName(v)})`,
        start: v.m.startsAt,
        durationMin: v.m.durationMin,
        place: url,
        description: `Lien de la visio : ${url}`,
        url,
      };
    }),
    ...todos
      .filter((t) => !visioTasks.has(t.id))
      .map((t) => ({ uid: `rappel-${t.id}@${host}`, title: `Rappel : ${t.title}`, start: t.dueOn, durationMin: 0, url: `${appUrl}/app/rappels` })),
  ];
}
