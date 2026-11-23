import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePhones, parseContactsCsv, phoneKey } from "../src/lib/contacts";
import { findDuplicateGroups, nameTokens } from "../src/lib/merge";

const c = (id: number, firstName: string | null, lastName: string | null, phone: string | null = null, phone2: string | null = null) =>
  ({ id, firstName, lastName, email: null, phone, phone2, phone3: null });

test("trois numéros sans doublon", () => {
  assert.equal(phoneKey("+229 97 12 34 56"), phoneKey("+229 01 97 12 34 56"));
  const m = mergePhones(["+225 07 12 34 56 78", "+229 97 00 11 22"], ["07 12 34 56 78", "+33 6 11 22 33 44", "+1 202 555 0101"]);
  assert.deepEqual(m.kept, ["+225 07 12 34 56 78", "+229 97 00 11 22", "+33 6 11 22 33 44"]);
  assert.deepEqual(m.extra, ["+1 202 555 0101"]);
});

test("import Google : tous les numéros d'une personne", () => {
  const csv = "First Name,Last Name,Phone 1 - Value,Phone 2 - Value,Phone 3 - Value\nMorel,AGBECI,+229 42 47 14 72 ::: +229 01 62 16 05 65,+33 6 11 22 33 44,";
  const [r] = parseContactsCsv(csv);
  assert.deepEqual([r!.phone, r!.phone2, r!.phone3], ["+229 42 47 14 72", "+229 01 62 16 05 65", "+33 6 11 22 33 44"]);
});

test("doublons : même nom écrit autrement, ou même numéro", () => {
  assert.deepEqual(nameTokens({ firstName: "Dr Morel-Frido", lastName: "AGBÉCI" }), ["morel", "frido", "agbeci"]);
  const groups = findDuplicateGroups([
    c(1, "Morel Frido", "AGBECI", "+22942471472"),
    c(2, "Morel", "AGBECI"),
    c(3, "AGBECI God-freed", "Morel"),
    c(4, "Rigobert", "AGBECI"),
    c(5, "Alida", "VIGNON"),
    c(6, "Vignon", "Alida"),
    c(7, "Maman", null, null, "+229 42 47 14 72"),
    c(8, "Awa", "Koné"),
  ]);
  assert.deepEqual(groups.map((g) => g.map((x) => x.id)), [[1, 2, 3, 7], [5, 6]]);
});
