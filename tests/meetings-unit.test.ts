import { test } from "node:test";
import assert from "node:assert/strict";
import { describeWhen, googleCalendarLink, invitationBody, jitsiUrl, meetingUrl, newRoom, normalizeMeetLink, parisToDate } from "../src/lib/meetings";
import { linkify, personalHtml } from "../src/lib/messages";

test("heure de Paris vers UTC, hiver comme été", () => {
  assert.equal(parisToDate("2026-11-30", "15:00")!.toISOString(), "2026-11-30T14:00:00.000Z");
  assert.equal(parisToDate("2026-07-01", "09:30")!.toISOString(), "2026-07-01T07:30:00.000Z");
  // Jour du passage à l'heure d'été (29 mars 2026).
  assert.equal(parisToDate("2026-03-29", "12:00")!.toISOString(), "2026-03-29T10:00:00.000Z");
  assert.equal(parisToDate("2026-11-30", "25:00"), null);
  assert.equal(parisToDate("30/11/2026", "15:00"), null);
});

test("invitation : jour, heure GMT, lien et agenda", () => {
  const at = parisToDate("2026-11-30", "15:00")!;
  assert.equal(describeWhen(at).replace(/\s/g, " "), "lundi 30 novembre 2026 à 15 h 00 (heure de Paris), soit 14 h 00 en heure GMT (Abidjan, Dakar, Lomé)");
  const room = newRoom();
  assert.match(room, /^AgbeciConsultation-[A-Za-z0-9]{12,}$/);
  assert.notEqual(room, newRoom());
  const body = invitationBody({ firstName: "Fatou", message: "Je vous propose un échange.", title: "Audit", startsAt: at, durationMin: 45, url: jitsiUrl(room) });
  assert.match(body, /^Bonjour Fatou,\n\nJe vous propose un échange\./);
  assert.ok(body.includes(jitsiUrl(room)));
  const cal = new URL(googleCalendarLink({ title: "Audit", startsAt: at, durationMin: 45, url: jitsiUrl(room) }));
  assert.equal(cal.searchParams.get("dates"), "20261130T140000Z/20261130T144500Z");
});

test("liens cliquables dans les emails personnels", () => {
  assert.equal(linkify("Voir https://meet.jit.si/Salle."), 'Voir <a href="https://meet.jit.si/Salle">https://meet.jit.si/Salle</a>.');
  const html = personalHtml("Lien : https://a.test/x?a=1&b=2");
  assert.ok(html.includes('<a href="https://a.test/x?a=1&amp;b=2">'));
  assert.ok(!personalHtml('<script>"https://x.test/"</script>').includes("<script>"));
});

test("lien Google Meet collé", () => {
  assert.equal(normalizeMeetLink(" https://meet.google.com/abc-defg-hij?authuser=0 "), "https://meet.google.com/abc-defg-hij");
  assert.equal(normalizeMeetLink("meet.google.com/ABC-DEFG-HIJ"), "https://meet.google.com/abc-defg-hij");
  assert.equal(normalizeMeetLink("https://evil.test/meet.google.com/abc-defg-hij"), null);
  assert.equal(normalizeMeetLink("https://meet.google.com.evil.test/abc-defg-hij"), null);
  assert.equal(meetingUrl({ room: "Salle", link: null }), "https://meet.jit.si/Salle");
  assert.equal(meetingUrl({ room: "Salle", link: "https://meet.google.com/abc-defg-hij" }), "https://meet.google.com/abc-defg-hij");
  const body = invitationBody({ firstName: null, message: "", title: "X", startsAt: new Date("2026-11-30T14:00:00Z"), durationMin: 30, url: "https://meet.google.com/abc-defg-hij" });
  assert.match(body, /^Bonjour,\n\nRendez-vous/);
  assert.match(body, /application Google Meet :\nhttps:\/\/meet\.google\.com\/abc-defg-hij/);
});
