import { buildIcs, checkCalendarToken, feedEntries } from "@/lib/calendar";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Abonnement iCalendar : /api/calendrier/<jeton>.ics (lecture seule, protégé par le jeton). */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!(await checkCalendarToken(token))) return new Response("Lien inconnu", { status: 404 });
  const body = buildIcs(await feedEntries(env.appUrl));
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agbeci-crm.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
