/**
 * Email du matin : vers 7 h (heure de Paris), un récapitulatif envoyé à Honorat lui-même :
 * rappels du jour et en retard, visios du jour, emails non lus, envois en échec.
 */
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "./env";
import { eventsOfDay } from "./calendar";
import { meetingUrl } from "./meetings";
import { personalHtml, personalText, unseenInboxCount } from "./messages";
import { formatDay, openTasks, todayParis } from "./prospection";
import { PRIORITY } from "./queue";
import { getMailSettings } from "./settings";

const { settings, meetings, contacts, outbox } = schema;
const KEY_ENABLED = "morning_digest";
const KEY_LAST = "morning_digest_last";
export const DIGEST_HOUR = 7;

async function getSetting(key: string): Promise<string | null> {
  const [row] = await getDb().select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await getDb()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

/** Activé par défaut. */
export async function digestEnabled(): Promise<boolean> {
  return (await getSetting(KEY_ENABLED)) !== "off";
}

export async function setDigestEnabled(on: boolean) {
  await setSetting(KEY_ENABLED, on ? "on" : "off");
}

/** Heure de Paris (0-23) à un instant donné. */
export function parisHour(now: Date): number {
  return Number(now.toLocaleString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }));
}

/** Bornes UTC de la journée de Paris qui contient « now ». */
function parisDayBounds(now: Date): [Date, Date] {
  const day = todayParis(now);
  const start = new Date(`${day}T00:00:00Z`);
  // Décalage Paris/UTC (1 ou 2 h) : on prend large puis on filtre sur le jour de Paris.
  return [new Date(start.getTime() - 3 * 3600_000), new Date(start.getTime() + 27 * 3600_000)];
}

const hm = (d: Date) => d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", " h ");

export async function buildDigest(now = new Date()) {
  const today = todayParis(now);
  const [from, to] = parisDayBounds(now);
  const [tasks, visiosRaw, unseen, [failed], rdv] = await Promise.all([
    openTasks({ until: today }),
    getDb()
      .select({ m: meetings, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
      .from(meetings)
      .innerJoin(contacts, eq(contacts.id, meetings.contactId))
      .where(and(isNull(meetings.canceledAt), gte(meetings.startsAt, from), lt(meetings.startsAt, to)))
      .orderBy(meetings.startsAt),
    unseenInboxCount().catch(() => 0),
    getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(outbox)
      .where(inArray(outbox.status, ["failed"])),
    eventsOfDay(today),
  ]);
  const visios = visiosRaw.filter((v) => todayParis(v.m.startsAt) === today);
  // Le rappel automatique d'une visio fait doublon avec la liste des visios.
  const visioTaskIds = new Set(visios.map((v) => v.m.taskId).filter(Boolean));
  const todo = tasks.filter((t) => !visioTaskIds.has(t.t.id));
  const late = todo.filter((t) => t.t.dueOn < today);
  const now_ = todo.filter((t) => t.t.dueOn === today);
  const nFailed = Number(failed?.n ?? 0);

  const who = (t: (typeof todo)[number]) => {
    const parts = [t.contactName || t.contactEmail, t.opportunityTitle].filter(Boolean);
    return parts.length ? ` (${parts.join(", ")})` : "";
  };
  const lines: string[] = [];
  if (rdv.length) {
    lines.push(`Rendez-vous aujourd'hui :\n${rdv.map((e) => `• ${e.time ?? "Toute la journée"} : ${e.title}${e.detail ? ` (${e.detail})` : ""}`).join("\n")}`);
  }
  if (visios.length) {
    lines.push(`Visios aujourd'hui :\n${visios
      .map((v) => `• ${hm(v.m.startsAt)} : ${v.m.title} avec ${[v.firstName, v.lastName].filter(Boolean).join(" ") || v.email || "votre contact"}\n  ${meetingUrl(v.m)}`)
      .join("\n")}`);
  }
  if (now_.length) lines.push(`À faire aujourd'hui :\n${now_.map((t) => `• ${t.t.title}${who(t)}`).join("\n")}`);
  if (late.length) lines.push(`En retard :\n${late.map((t) => `• ${t.t.title}${who(t)}, prévu ${formatDay(t.t.dueOn)}`).join("\n")}`);
  if (unseen > 0) lines.push(`Messagerie : ${unseen} conversation(s) non lue(s).`);
  if (nFailed > 0) lines.push(`Attention : ${nFailed} email(s) n'ont pas pu partir. Voir le tableau de bord.`);

  const counts = [
    rdv.length && `${rdv.length} rendez-vous`,
    visios.length && `${visios.length} visio${visios.length > 1 ? "s" : ""}`,
    now_.length + late.length && `${now_.length + late.length} rappel${now_.length + late.length > 1 ? "s" : ""}`,
    unseen && `${unseen} non lu${unseen > 1 ? "s" : ""}`,
  ].filter(Boolean);
  const subject = counts.length ? `Votre journée : ${counts.join(", ")}` : "Votre journée : rien d'urgent";
  const body = [
    "Bonjour Honorat,",
    ...(lines.length ? lines : ["Rien d'urgent aujourd'hui : aucun rendez-vous, aucun rappel, aucune visio, aucun message non lu."]),
    `Ouvrir le CRM : ${env.appUrl}/app`,
    "(Email envoyé automatiquement chaque matin par votre CRM. Vous pouvez le couper dans Réglages.)",
  ].join("\n\n");
  return { subject, body, empty: lines.length === 0 };
}

/** Met le récapitulatif dans la file d'envoi, adressé à Honorat lui-même. */
export async function queueDigest(now = new Date(), opts: { evenIfEmpty?: boolean } = {}) {
  const mail = await getMailSettings();
  if (!mail.address) return false;
  const d = await buildDigest(now);
  if (d.empty && !opts.evenIfEmpty) return false;
  await getDb().insert(outbox).values({
    kind: "personal",
    toEmail: mail.address,
    subject: d.subject,
    html: personalHtml(d.body),
    text: personalText(d.body),
    headers: {},
    priority: PRIORITY.personal,
  });
  return true;
}

/** Appelé par le worker : une fois par jour, à partir de 7 h (heure de Paris). */
export async function maybeSendDigest(now = new Date()): Promise<"sent" | "empty" | "skip"> {
  if (parisHour(now) < DIGEST_HOUR) return "skip";
  const today = todayParis(now);
  const last = await getSetting(KEY_LAST);
  if (last === today) return "skip";
  // Toute première fois (mise en service) : on commence le lendemain matin, pas au milieu de la journée.
  if (last === null) {
    await setSetting(KEY_LAST, today);
    return "skip";
  }
  if (!(await digestEnabled()) || !(await getMailSettings()).configured) return "skip";
  // On note le jour avant l'envoi : en cas de souci, pas de doublon.
  await setSetting(KEY_LAST, today);
  return (await queueDigest(now)) ? "sent" : "empty";
}
