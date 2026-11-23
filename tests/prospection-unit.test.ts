import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, formatAmount, isDay, personalize, todayParis } from "../src/lib/prospection";

test("personnalisation des envois groupés", () => {
  const c = { firstName: "Awa", lastName: "Koné", company: "Clinique du Plateau" };
  assert.equal(personalize("Bonjour {prenom} {nom}, ({organisation})", c), "Bonjour Awa Koné, (Clinique du Plateau)");
  assert.equal(personalize("Bonjour {Prénom},", c), "Bonjour Awa,");
  // Prénom absent : pas d'espace orphelin devant la virgule.
  assert.equal(personalize("Bonjour {prenom}, merci.", { firstName: null, lastName: null, company: null }), "Bonjour, merci.");
  // Ponctuation française conservée devant « ? » et « ! ».
  assert.equal(personalize("Disponible {prenom} ?", c), "Disponible Awa ?");
});

test("dates et montants", () => {
  assert.equal(addDays("2026-02-27", 3), "2026-03-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.ok(isDay("2026-11-23"));
  assert.ok(!isDay("23/11/2026"));
  // 23 h 30 UTC le 31 décembre = déjà le 1er janvier à Paris.
  assert.equal(todayParis(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
  assert.equal(formatAmount(1500000, "XOF").replace(/\s/g, " "), "1 500 000 F CFA");
  assert.equal(formatAmount(null, "EUR"), "");
});
