import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, foldLine, icsText, isDay, isMonth, mondayOf, monthWeeks, parseEventInput, shiftMonth, weekDays } from "../src/lib/calendar";

test("jours, semaines et mois", () => {
  assert.ok(isDay("2026-11-23"));
  assert.ok(!isDay("2026-02-30"));
  assert.ok(!isDay("23/11/2026"));
  assert.ok(isMonth("2026-11") && !isMonth("2026-13"));
  assert.equal(mondayOf("2026-11-29"), "2026-11-23"); // dimanche → lundi précédent
  assert.equal(mondayOf("2026-11-23"), "2026-11-23");
  assert.deepEqual(weekDays("2026-11-25"), ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
  const weeks = monthWeeks("2026-11"); // 1er novembre 2026 = dimanche
  assert.equal(weeks[0]![0], "2026-10-26");
  assert.equal(weeks[0]![6], "2026-11-01");
  assert.equal(weeks.at(-1)![6], "2026-12-06");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("saisie d'un rendez-vous", () => {
  const base = { title: " Conférence ", day: "2026-11-30", time: "15:00", allDay: false, durationMin: 60, place: "", notes: "", contactId: null };
  const ok = parseEventInput(base);
  assert.ok("values" in ok);
  if ("values" in ok) {
    assert.equal(ok.values.title, "Conférence");
    assert.equal(ok.values.startsAt.toISOString(), "2026-11-30T14:00:00.000Z"); // heure d'hiver
    assert.equal(ok.values.place, null);
  }
  const summer = parseEventInput({ ...base, day: "2027-07-01" });
  assert.ok("values" in summer && summer.values.startsAt.toISOString() === "2027-07-01T13:00:00.000Z");
  assert.deepEqual(parseEventInput({ ...base, title: "" }), { error: "Donnez un titre au rendez-vous." });
  assert.ok("error" in parseEventInput({ ...base, time: "" }));
  assert.ok("values" in parseEventInput({ ...base, time: "", allDay: true }));
  assert.ok("error" in parseEventInput({ ...base, durationMin: 7 }));
});

test("fichier iCalendar", () => {
  assert.equal(icsText("a, b; c\\d\ne"), "a\\, b\\; c\\\\d\\ne");
  const long = "DESCRIPTION:" + "é".repeat(80);
  const folded = foldLine(long);
  for (const l of folded.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75);
  assert.equal(folded.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join(""), long);
  const ics = buildIcs(
    [
      { uid: "rdv-1@x", title: "Banque", start: new Date("2026-11-30T14:00:00Z"), durationMin: 90, place: "Paris" },
      { uid: "rappel-2@x", title: "Rappel : appeler", start: "2026-12-01", durationMin: 0 },
    ],
    new Date("2026-11-23T10:00:00Z"),
  );
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261130T140000Z\r\nDTEND:20261130T153000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202/);
  assert.match(ics, /LOCATION:Paris/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
