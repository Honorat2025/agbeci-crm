import { test } from "node:test";
import assert from "node:assert/strict";
import { contactLabel, normalizeLinkedin, parseAnyContactsCsv, parseContactsCsv, parseLinkedinCsv, phoneKey } from "../src/lib/contacts";

test("profil LinkedIn et numéro", () => {
  assert.equal(normalizeLinkedin("linkedin.com/in/Awa-Kone/?originalSubdomain=ci"), "https://www.linkedin.com/in/awa-kone");
  assert.equal(normalizeLinkedin("https://fr.linkedin.com/in/kofi-mensah-123"), "https://www.linkedin.com/in/kofi-mensah-123");
  assert.equal(normalizeLinkedin("https://www.linkedin.com/company/oms"), null);
  assert.equal(normalizeLinkedin(""), null);
  assert.equal(phoneKey("+225 07 12 34 56 78"), phoneKey("0712345678".replace(/^/, "225")));
  assert.equal(phoneKey("+33 6 12 34 56 78"), phoneKey("06 12 34 56 78"));
  assert.equal(phoneKey("123"), null);
  assert.equal(contactLabel({ firstName: null, lastName: null, email: null, phone: "+225 07" }), "+225 07");
  assert.equal(contactLabel({ firstName: null, lastName: null, email: null, linkedinUrl: "https://www.linkedin.com/in/awa-kone" }), "LinkedIn : awa-kone");
});

test("import Google : contacts avec téléphone seulement", () => {
  const csv = "Name,E-mail 1 - Value,Phone 1 - Value\nAwa Koné,awa@example.ci,\nYao Kouassi,,+225 07 12 34 56 78\nSans rien,,\nDoublon,,07 12 34 56 78";
  const rows = parseContactsCsv(csv);
  assert.deepEqual(rows.map((r) => [r.email, r.phone, r.firstName]), [
    ["awa@example.ci", null, "Awa"],
    [null, "+225 07 12 34 56 78", "Yao"],
  ]);
});

test("import LinkedIn (Connections.csv)", () => {
  const csv = [
    "Notes:",
    '"When exporting your connection data, you may notice that some of the email addresses are missing."',
    "",
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    "Fatou,Diop,https://www.linkedin.com/in/fatou-diop,,Ministère de la Santé,Directrice,12 Mar 2024",
    "Kofi,Mensah,https://www.linkedin.com/in/kofimensah,k.mensah@univ-lome.tg,Université de Lomé,Professeur,01 Jan 2023",
  ].join("\n");
  const rows = parseLinkedinCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { email: null, linkedinUrl: "https://www.linkedin.com/in/fatou-diop", firstName: "Fatou", lastName: "Diop", company: "Ministère de la Santé", jobTitle: "Directrice", tags: ["linkedin"] });
  assert.equal(rows[1]!.email, "k.mensah@univ-lome.tg");
  assert.equal(parseAnyContactsCsv(csv).format, "linkedin");
  assert.equal(parseAnyContactsCsv("Name,E-mail 1 - Value\nA,a@b.fr").format, "google");
});
