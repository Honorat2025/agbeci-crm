import { test } from "node:test";
import assert from "node:assert/strict";
import { simpleParser } from "mailparser";
import { blockRemoteImages, cleanEmailHtml, makeSnippet, toRow } from "../src/lib/mailbox";
import { parseContactsCsv, parseCsv, splitName } from "../src/lib/contacts";
import { personalHtml, personalText, replySubject, replyTarget } from "../src/lib/messages";

const RAW = [
  "From: =?UTF-8?Q?Awa_Kon=C3=A9?= <Awa@Example.com>",
  "To: Honorat <moi@gmail.com>, autre@example.org",
  "Cc: copie@example.net",
  "Subject: =?UTF-8?Q?Proposition_d'=C3=A9tude?=",
  "Message-ID: <abc@example.com>",
  "In-Reply-To: <prev@gmail.com>",
  "References: <first@gmail.com> <prev@gmail.com>",
  "Date: Sun, 22 Nov 2026 10:00:00 +0100",
  "MIME-Version: 1.0",
  'Content-Type: multipart/alternative; boundary="b"',
  "",
  "--b",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Bonjour Honorat,",
  "Voici ma proposition.",
  "> ancien message cité",
  "--b",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p onclick="x()">Bonjour <b>Honorat</b></p><script>alert(1)</script><img src="https://traceur.example/p.gif"><a href="javascript:alert(1)">x</a>',
  "--b--",
  "",
].join("\r\n");

test("un email Gmail devient une ligne propre", async () => {
  const parsed = await simpleParser(RAW);
  const row = toRow(
    { uid: 42, emailId: "1001", threadId: "9001", labels: new Set(["\\Inbox"]), flags: new Set(), internalDate: new Date() },
    parsed,
    "Moi@Gmail.com",
  );
  assert.equal(row.gmailId, "1001");
  assert.equal(row.threadId, "9001");
  assert.equal(row.fromEmail, "awa@example.com");
  assert.equal(row.fromName, "Awa Koné");
  assert.equal(row.subject, "Proposition d'étude");
  assert.equal(row.outgoing, false);
  assert.equal(row.seen, false);
  assert.deepEqual(row.labels, ["\\Inbox"]);
  assert.deepEqual(row.participants, ["awa@example.com", "moi@gmail.com", "autre@example.org", "copie@example.net"]);
  assert.equal(row.inReplyTo, "<prev@gmail.com>");
  assert.match(row.references ?? "", /first@gmail.com/);
  assert.equal(row.snippet, "Bonjour Honorat, Voici ma proposition.");
  assert.ok(row.htmlBody && !/script|onclick|javascript:/i.test(row.htmlBody), "le HTML doit être nettoyé");
});

test("images externes masquées par défaut", () => {
  const { html, blocked } = blockRemoteImages('<p>a</p><img src="https://x.test/a.png"><img src="data:image/png;base64,AA">');
  assert.equal(blocked, 1);
  assert.match(html, /data:image/);
  assert.doesNotMatch(cleanEmailHtml('<form action="x"><input></form><p>ok</p>'), /form|input/);
});

test("aperçu sans les citations", () => {
  assert.equal(makeSnippet("Merci !\n> vieux texte\nÀ bientôt"), "Merci ! À bientôt");
});

test("répondre : objet, destinataire et citation", () => {
  assert.equal(replySubject("Proposition"), "Re: Proposition");
  assert.equal(replySubject("RE: Proposition"), "RE: Proposition");
  const thread = [
    { outgoing: false, fromEmail: "awa@example.com", to: [{ address: "moi@gmail.com" }] },
    { outgoing: true, fromEmail: "moi@gmail.com", to: [{ address: "awa@example.com" }] },
  ];
  assert.equal(replyTarget(thread, "moi@gmail.com"), "awa@example.com");
  assert.equal(replyTarget([thread[1]!], "moi@gmail.com"), "awa@example.com");
  const quoted = { date: new Date("2026-11-22T09:00:00Z"), from: "Awa", text: "Ligne 1\nLigne 2" };
  assert.match(personalText("Merci", quoted), /Merci\n\nLe .* Awa a écrit :\n> Ligne 1\n> Ligne 2/);
  const html = personalHtml("<b>pas du HTML</b>\n\nDeuxième paragraphe", quoted);
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /blockquote/);
});

test("import CSV Google Contacts", () => {
  const csv = [
    "First Name,Middle Name,Last Name,Organization Name,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Value",
    'Awa,,Koné,"Ministère de la Santé, CI",* Work,AWA@example.com ::: awa2@example.com,+225 01',
    "Sans,,Email,,,,",
    'Jean,,"Dupont ""JD""",,,jean@example.org,',
    "Jean,,Doublon,,,jean@example.org,",
  ].join("\n");
  const rows = parseContactsCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { email: "awa@example.com", firstName: "Awa", lastName: "Koné", phone: "+225 01", company: "Ministère de la Santé, CI", jobTitle: null });
  assert.equal(rows[1]!.lastName, 'Dupont "JD"');
  assert.equal(parseCsv("a;b\n1;2").length, 2);
  assert.deepEqual(parseContactsCsv("Prénom;Nom;Adresse e-mail\nAwa;Koné;awa@example.com")[0]?.firstName, "Awa");
  assert.deepEqual(splitName("Awa Marie Koné"), { firstName: "Awa", lastName: "Marie Koné" });
  assert.deepEqual(splitName("x@y.fr"), { firstName: null, lastName: null });
});
