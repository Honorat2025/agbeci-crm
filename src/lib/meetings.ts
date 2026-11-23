/**
 * Visios : rendez-vous Jitsi Meet (meet.jit.si), invitation par Gmail via la file d'envoi, rappel le jour J.
 */
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { randomToken } from "./crypto";
import { personalHtml, personalText } from "./messages";
import { PRIORITY } from "./queue";

const { meetings, contacts, opportunities, outbox, tasks } = schema;

export const JITSI_BASE = "https://meet.jit.si";
export const DURATIONS = [30, 45, 60, 90] as const;

/** Nom de salon long et aléatoire : impossible à deviner, lisible dans un lien. */
export function newRoom(): string {
  return `AgbeciConsultation-${randomToken(16).replace(/[^A-Za-z0-9]/g, "")}`;
}

export const jitsiUrl = (room: string) => `${JITSI_BASE}/${room}`;

export type Provider = "jitsi" | "meet";

/** Lien Google Meet tel qu'on le copie (meet.google.com/abc-defg-hij). */
export function normalizeMeetLink(value: string): string | null {
  const v = value.trim().replace(/^(?!https?:\/\/)/, "https://");
  const m = /^https?:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:[/?#].*)?$/i.exec(v);
  return m ? `https://meet.google.com/${m[1]!.toLowerCase()}` : null;
}

/** Lien de la visio : Google Meet collé, sinon le salon Jitsi. */
export const meetingUrl = (m: { room: string; link: string | null }) => m.link ?? jitsiUrl(m.room);

/** Décalage (en minutes) entre l'heure d'un fuseau et UTC à un instant donné. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return Math.round((wall - at.getTime()) / 60000);
}

/** « 2026-11-30 » + « 15:00 », heure de Paris, vers un instant précis (gère heure d'été / d'hiver). */
export function parisToDate(day: string, time: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m || !t || +t[1]! > 23 || +t[2]! > 59) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +t[1]!, +t[2]!);
  let at = new Date(guess - offsetMinutes(new Date(guess), "Europe/Paris") * 60000);
  at = new Date(guess - offsetMinutes(at, "Europe/Paris") * 60000);
  return Number.isNaN(at.getTime()) ? null : at;
}

const fmt = (d: Date, timeZone: string, opts: Intl.DateTimeFormatOptions) => d.toLocaleString("fr-FR", { timeZone, ...opts });

/** « lundi 30 novembre 2026 à 15 h 00 (heure de Paris), soit 14 h 00 en heure GMT (Abidjan, Dakar, Lomé) » */
export function describeWhen(at: Date): string {
  const hm = (tz: string) => fmt(at, tz, { hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
  const day = fmt(at, "Europe/Paris", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const paris = hm("Europe/Paris");
  const gmt = hm("UTC");
  return paris === gmt
    ? `${day} à ${paris} (heure de Paris et GMT : Abidjan, Dakar, Lomé)`
    : `${day} à ${paris} (heure de Paris), soit ${gmt} en heure GMT (Abidjan, Dakar, Lomé)`;
}

/** Lien « Ajouter à Google Agenda » (aucun compte ni service supplémentaire). */
export function googleCalendarLink(m: { title: string; startsAt: Date; durationMin: number; url: string }): string {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(m.startsAt.getTime() + m.durationMin * 60000);
  const p = new URLSearchParams({ action: "TEMPLATE", text: m.title, dates: `${z(m.startsAt)}/${z(end)}`, details: `Visio : ${m.url}`, location: m.url });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export const DEFAULT_INVITE =
  "Je vous propose d'échanger en visio. Vous trouverez ci-dessous le jour, l'heure et le lien pour nous retrouver.";

export function invitationBody(input: { firstName: string | null; message: string; title: string; startsAt: Date; durationMin: number; url: string }): string {
  const url = input.url;
  const how = url.startsWith("https://meet.google.com/")
    ? "Pour nous rejoindre, cliquez sur ce lien au moment du rendez-vous : depuis un ordinateur, il s'ouvre dans le navigateur ; depuis un téléphone, avec l'application Google Meet"
    : "Pour nous rejoindre, cliquez simplement sur ce lien au moment du rendez-vous, depuis un ordinateur ou un téléphone (rien à installer, aucun compte à créer)";
  return [
    `Bonjour${input.firstName ? ` ${input.firstName}` : ""},`,
    input.message.trim(),
    `Rendez-vous : ${describeWhen(input.startsAt)}, durée ${input.durationMin} minutes.`,
    `${how} :\n${url}`,
    `Ajouter le rendez-vous à votre agenda Google :\n${googleCalendarLink({ title: input.title, startsAt: input.startsAt, durationMin: input.durationMin, url })}`,
    "Bien cordialement,\nDr Honorat AGBECI",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function scheduleMeeting(input: {
  contactId: number;
  opportunityId: number | null;
  title: string;
  startsAt: Date;
  durationMin: number;
  message: string;
  /** Lien Google Meet déjà vérifié ; absent = Jitsi. */
  link?: string | null;
}) {
  const db = getDb();
  const [c] = await db.select().from(contacts).where(eq(contacts.id, input.contactId));
  if (!c) throw new Error("Contact introuvable.");
  const room = newRoom();
  const link = input.link ?? null;
  const url = meetingUrl({ room, link });
  const day = input.startsAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const hour = fmt(input.startsAt, "Europe/Paris", { hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
  const body = invitationBody({ firstName: c.firstName, message: input.message, title: input.title, startsAt: input.startsAt, durationMin: input.durationMin, url });
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({ title: `Visio à ${hour} : ${input.title}`.slice(0, 300), dueOn: day, contactId: c.id, opportunityId: input.opportunityId })
      .returning({ id: tasks.id });
    const [m] = await tx
      .insert(meetings)
      .values({
        title: input.title,
        contactId: c.id,
        opportunityId: input.opportunityId,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        room,
        link,
        taskId: task!.id,
      })
      .returning({ id: meetings.id });
    await tx.insert(outbox).values({
      kind: "personal",
      contactId: c.id,
      toEmail: c.email,
      subject: `Visio : ${input.title}`.slice(0, 200),
      html: personalHtml(body),
      text: personalText(body),
      headers: {},
      priority: PRIORITY.personal,
    });
    return { id: m!.id, room, url };
  });
}

/** Annule : prévient la personne par email et retire le rappel. */
export async function cancelMeeting(id: number) {
  const db = getDb();
  const [m] = await db.select().from(meetings).where(eq(meetings.id, id));
  if (!m || m.canceledAt) return;
  const [c] = await db.select().from(contacts).where(eq(contacts.id, m.contactId));
  const body = [
    `Bonjour${c?.firstName ? ` ${c.firstName}` : ""},`,
    `Je dois malheureusement annuler notre visio prévue le ${describeWhen(m.startsAt)}. Je reviens vers vous très vite pour convenir d'une autre date.`,
    "Bien cordialement,\nDr Honorat AGBECI",
  ].join("\n\n");
  await db.transaction(async (tx) => {
    await tx.update(meetings).set({ canceledAt: new Date() }).where(eq(meetings.id, id));
    if (m.taskId) await tx.delete(tasks).where(eq(tasks.id, m.taskId));
    if (c) {
      await tx.insert(outbox).values({
        kind: "personal",
        contactId: c.id,
        toEmail: c.email,
        subject: `Annulation : visio ${m.title}`.slice(0, 200),
        html: personalHtml(body),
        text: personalText(body),
        headers: {},
        priority: PRIORITY.personal,
      });
    }
  });
}

/** Visios à venir (et celles en cours depuis moins de 2 h), les plus proches d'abord. */
export async function upcomingMeetings(opts: { contactId?: number; opportunityId?: number; limit?: number } = {}) {
  const since = new Date(Date.now() - 2 * 3600 * 1000);
  const filters = [isNull(meetings.canceledAt), gte(meetings.startsAt, since)];
  if (opts.contactId) filters.push(eq(meetings.contactId, opts.contactId));
  if (opts.opportunityId) filters.push(eq(meetings.opportunityId, opts.opportunityId));
  const rows = await getDb()
    .select({ m: meetings, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone, country: contacts.country, opportunityTitle: opportunities.title })
    .from(meetings)
    .innerJoin(contacts, eq(contacts.id, meetings.contactId))
    .leftJoin(opportunities, eq(opportunities.id, meetings.opportunityId))
    .where(and(...filters))
    .orderBy(asc(meetings.startsAt))
    .limit(opts.limit ?? 50);
  return rows.map((r) => ({ ...r, url: meetingUrl(r.m), provider: (r.m.link ? "meet" : "jitsi") as Provider, name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email }));
}

/** Date courte pour les listes : « lun. 30 nov., 15 h 00 ». */
export function shortWhen(at: Date): string {
  return `${fmt(at, "Europe/Paris", { weekday: "short", day: "numeric", month: "short" })}, ${fmt(at, "Europe/Paris", { hour: "2-digit", minute: "2-digit" }).replace(":", " h ")}`;
}
