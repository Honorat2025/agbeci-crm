/**
 * Parcours complet contre une vraie base PostgreSQL.
 * Lancer avec TEST_DATABASE_URL=postgres://... npm test (sinon ignoré).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = url;
process.env.APP_URL = "https://crm.example.test";
process.env.ENCRYPTION_KEY ??= "test-encryption-key-0123456789abcdef";
delete process.env.MAIL_TRANSPORT;

import { getDb, getSql, closeDb, schema } from "../src/db";
import { subscribe, confirmSubscription, unsubscribe } from "../src/lib/subscribers";
import { createNewsletter, queueNewsletter, markFinishedNewsletters, draftFromWordPressPost } from "../src/lib/newsletters";
import { processOutbox } from "../src/lib/queue";
import { LogMailer, createMailer } from "../src/lib/mailer";
import { getMailSettings, saveMailSettings, normalizeAppPassword } from "../src/lib/settings";

const skip = !url && "TEST_DATABASE_URL non défini";

before(async () => {
  if (!url) return;
  const sql = getSql();
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
});

after(async () => {
  if (url) await closeDb();
});

const meta = { ip: "203.0.113.5", source: "test" };

test("inscription, confirmation, newsletter, désinscription", { skip }, async () => {
  const db = getDb();
  const mailer = new LogMailer();

  assert.equal(await subscribe({ email: "awa@example.com", firstName: "Awa" }, meta), "confirmation_sent");
  const [pending] = await db.select().from(schema.contacts).where(eq(schema.contacts.email, "awa@example.com"));
  assert.equal(pending!.newsletterStatus, "pending");
  assert.equal(pending!.consentIp, "203.0.113.5");

  // Le lien de confirmation n'est stocké que dans l'email lui-même.
  const [confirmMail] = await db.select().from(schema.outbox).where(eq(schema.outbox.kind, "confirm"));
  const token = /confirmer\?t=([A-Za-z0-9_-]+)/.exec(confirmMail!.html)![1]!;
  assert.equal(await confirmSubscription("mauvais-jeton"), false);
  assert.equal(await confirmSubscription(token), true);
  assert.equal(await confirmSubscription(token), false, "un lien ne sert qu'une fois");

  assert.equal(await subscribe({ email: "awa@example.com" }, meta), "already_subscribed");

  assert.equal(await processOutbox(mailer, { dailyLimit: 400 }), 2);
  assert.deepEqual(mailer.sent.map((m) => m.subject), [
    "Confirmez votre inscription à la newsletter",
    "Bienvenue dans ma newsletter",
  ]);

  const n = await createNewsletter({ subject: "Numéro 1", preheader: null, bodyMarkdown: "Bonjour **Awa**" });
  assert.equal(await queueNewsletter(n.id), 1);
  await assert.rejects(queueNewsletter(n.id), /déjà été envoyée/);

  assert.equal(await processOutbox(mailer, { dailyLimit: 400 }), 1);
  const last = mailer.sent.at(-1)!;
  assert.equal(last.to, "awa@example.com");
  assert.ok(last.headers?.["List-Unsubscribe"]);
  await markFinishedNewsletters();
  const [sentN] = await db.select().from(schema.newsletters).where(eq(schema.newsletters.id, n.id));
  assert.equal(sentN!.status, "sent");

  const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.email, "awa@example.com"));
  assert.equal(await unsubscribe(contact!.unsubscribeToken), true);
  const n2 = await createNewsletter({ subject: "Numéro 2", preheader: null, bodyMarkdown: "x" });
  assert.equal(await queueNewsletter(n2.id), 0);
});

test("le quota quotidien bloque les envois en trop", { skip }, async () => {
  const mailer = new LogMailer();
  for (const e of ["a1@example.com", "a2@example.com", "a3@example.com"]) {
    await subscribe({ email: e }, meta);
  }
  // Déjà 3 emails envoyés dans le test précédent : avec une limite de 4, un seul peut partir.
  assert.equal(await processOutbox(mailer, { dailyLimit: 4 }), 1);
  assert.equal(await processOutbox(mailer, { dailyLimit: 4 }), 0);
});

test("un article WordPress crée un seul brouillon", { skip }, async () => {
  const post = { title: "Mon article", url: "https://honoratagbeci.com/mon-article", excerpt: "Résumé" };
  const a = await draftFromWordPressPost(post);
  const b = await draftFromWordPressPost(post);
  assert.equal(a.id, b.id);
  assert.equal(a.status, "draft");
  assert.match(a.bodyMarkdown, /Lire l'article/);
});

test("réglages Gmail : mot de passe chiffré en base, envoi réel activé", { skip }, async () => {
  const before = await createMailer();
  assert.equal(before.mode, "simulé");

  const password = normalizeAppPassword("abcd efgh ijkl mnop");
  assert.equal(password, "abcdefghijklmnop");
  await saveMailSettings({ address: "honorat@example.test", password, fromName: "Honorat" });

  const [row] = await getDb()
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "gmail_app_password_enc"));
  assert.ok(row && !row.value.includes(password), "le mot de passe ne doit pas être stocké en clair");

  const s = await getMailSettings();
  assert.equal(s.configured, true);
  assert.equal(s.password, password);
  assert.equal(s.source, "application");

  // Sans nouveau mot de passe, l'ancien est conservé.
  await saveMailSettings({ address: "honorat@example.test", fromName: "Honorat A." });
  const s2 = await getMailSettings();
  assert.equal(s2.password, password);
  assert.equal(s2.fromName, "Honorat A.");
  assert.equal((await createMailer()).mode, "gmail");
});

test("messagerie : conversations, lecture, réponse, fiches", { skip }, async () => {
  const { storeRows, markThreadSeen } = await import("../src/lib/mailbox");
  const { listThreads, getThread, queueReply, queueNewMessage, unseenInboxCount } = await import("../src/lib/messages");
  const { suggestedContacts, ensureContact, addNote, listNotes, exchangeStats } = await import("../src/lib/contacts");
  const db = getDb();
  const own = "honorat@example.test"; // adresse enregistrée dans le test précédent
  const base = {
    to: [] as { address: string; name?: string }[],
    cc: [] as { address: string; name?: string }[],
    textBody: "",
    snippet: "",
    attachments: [],
    references: null,
    inReplyTo: null,
  };
  await storeRows([
    { ...base, gmailId: "m1", threadId: "t1", uid: 1, messageIdHeader: "<m1@x>", fromEmail: "awa@partenaire.ci", fromName: "Awa Koné",
      to: [{ address: own }], participants: ["awa@partenaire.ci", own], subject: "Étude au Togo", textBody: "Bonjour,\npouvez-vous m'aider ?",
      snippet: "Bonjour, pouvez-vous m'aider ?", labels: ["\\Inbox"], outgoing: false, seen: false, date: new Date("2026-11-20T10:00:00Z") },
    { ...base, gmailId: "m2", threadId: "t1", uid: 2, messageIdHeader: "<m2@x>", references: "<m1@x>", fromEmail: own, fromName: "Honorat",
      to: [{ address: "awa@partenaire.ci", name: "Awa Koné" }], participants: [own, "awa@partenaire.ci"], subject: "Re: Étude au Togo",
      snippet: "Avec plaisir", textBody: "Avec plaisir", labels: ["\\Sent"], outgoing: true, seen: true, date: new Date("2026-11-20T12:00:00Z") },
    { ...base, gmailId: "m3", threadId: "t2", uid: 3, fromEmail: "no-reply@banque.fr", to: [{ address: own }],
      participants: ["no-reply@banque.fr", own], subject: "Relevé", labels: ["\\Inbox"], outgoing: false, seen: true, date: new Date("2026-11-21T08:00:00Z") },
  ]);
  // Une seconde recopie du même message ne crée pas de doublon.
  await storeRows([{ ...base, gmailId: "m3", threadId: "t2", uid: 3, fromEmail: "no-reply@banque.fr", participants: [], subject: "Relevé", labels: ["\\Inbox"], outgoing: false, seen: true, date: new Date() }]);

  const inbox = await listThreads({ folder: "reception" });
  assert.deepEqual(inbox.threads.map((t) => t.threadId), ["t2", "t1"]);
  const t1 = inbox.threads.find((t) => t.threadId === "t1")!;
  assert.equal(t1.count, 2);
  assert.equal(t1.unseen, 1);
  assert.equal(t1.subject, "Étude au Togo");
  assert.deepEqual(t1.people, ["Awa Koné"]);
  assert.equal(t1.outgoingLast, true);
  assert.deepEqual((await listThreads({ folder: "envoyes" })).threads.map((t) => t.threadId), ["t1"]);
  assert.deepEqual((await listThreads({ folder: "tous", q: "togo" })).threads.map((t) => t.threadId), ["t1"]);
  assert.equal(await unseenInboxCount(), 1);

  assert.equal(await markThreadSeen("t1"), 1);
  assert.equal(await unseenInboxCount(), 0);
  const [action] = await db.select().from(schema.mailActions);
  assert.deepEqual(action!.uids, [1]);

  await queueReply({ threadId: "t1", to: "awa@partenaire.ci", body: "Voici le devis." });
  const [reply] = await db.select().from(schema.outbox).where(eq(schema.outbox.kind, "personal"));
  assert.equal(reply!.subject, "Re: Étude au Togo");
  assert.equal(reply!.headers["In-Reply-To"], "<m2@x>");
  assert.equal(reply!.headers["References"], "<m1@x> <m2@x>");
  assert.equal(reply!.headers["List-Unsubscribe"], undefined, "pas de lien de désinscription sur un email personnel");
  assert.match(reply!.text, /Voici le devis\.\n\nLe .* Honorat a écrit :\n> Avec plaisir/);

  await queueNewMessage({ to: "nouveau@exemple.sn", cc: "copie@exemple.sn", subject: "Bonjour", body: "Premier contact" });
  const mailer = new LogMailer();
  await processOutbox(mailer, { dailyLimit: 400 });
  const sentPersonal = mailer.sent.filter((m) => m.subject === "Bonjour" || m.subject === "Re: Étude au Togo");
  assert.equal(sentPersonal.length, 2);
  assert.equal(sentPersonal.find((m) => m.subject === "Bonjour")!.cc, "copie@exemple.sn");

  // Suggestions : les personnes à qui Honorat a écrit, sans les robots.
  const sugg = await suggestedContacts();
  assert.deepEqual(sugg.map((s) => s.address), ["awa@partenaire.ci"]);
  const created = await ensureContact("Awa@Partenaire.ci", { firstName: "Awa", lastName: "Koné", source: "gmail", tags: ["client"] });
  assert.equal(created.created, true);
  const again = await ensureContact("awa@partenaire.ci", { firstName: "Autre", company: "OMS", source: "gmail", tags: ["togo"] });
  assert.deepEqual(again, { id: created.id, created: false });
  const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, created.id));
  assert.equal(c!.firstName, "Awa", "un prénom existant n'est pas écrasé");
  assert.equal(c!.company, "OMS", "un champ vide est complété");
  assert.deepEqual(c!.tags, ["client", "togo"]);
  assert.equal(c!.newsletterStatus, "none", "une fiche n'abonne jamais à la newsletter");
  assert.deepEqual(await suggestedContacts(), []);

  await addNote(created.id, "Appel prévu lundi");
  assert.equal((await listNotes(created.id))[0]!.body, "Appel prévu lundi");
  const st = await exchangeStats("awa@partenaire.ci");
  assert.equal(st.count, 2);
  assert.ok(st.last instanceof Date && !Number.isNaN(st.last.getTime()));
  assert.deepEqual((await listThreads({ folder: "tous", participant: "awa@partenaire.ci" })).threads.map((t) => t.threadId), ["t1"]);
  assert.equal((await getThread("t1")).length, 2);
});

test("le site WordPress peut créer des fiches (demandes de documents)", { skip }, async () => {
  const { POST } = await import("../src/app/api/wp/contacts/route");
  process.env.WP_SHARED_SECRET = "secret-de-test-0123456789abcdef0123";
  const call = (body: unknown, secret = process.env.WP_SHARED_SECRET!) =>
    POST(new Request("https://crm.example.test/api/wp/contacts", {
      method: "POST",
      headers: { "content-type": "application/json", "x-agbeci-secret": secret },
      body: JSON.stringify(body),
    }));
  assert.equal((await call({ contacts: [] }, "mauvais")).status, 401);
  const payload = { contacts: [{ email: "Lecteur@Example.com", name: "Kofi Mensah", note: "Demande du document : Guide ETS", tag: "document" }] };
  const res = await call(payload);
  assert.deepEqual(await res.json(), { ok: true, received: 1, created: 1 });
  await call(payload); // rejouer ne crée ni doublon ni note en double
  const [c] = await getDb().select().from(schema.contacts).where(eq(schema.contacts.email, "lecteur@example.com"));
  assert.equal(c!.firstName, "Kofi");
  assert.deepEqual(c!.tags, ["document"]);
  assert.equal(c!.newsletterStatus, "none");
  const notes = await getDb().select().from(schema.contactNotes).where(eq(schema.contactNotes.contactId, c!.id));
  assert.equal(notes.length, 1);
});

test("prospection : affaires, rappels, envoi groupé personnalisé", { skip }, async () => {
  const { ensureContact } = await import("../src/lib/contacts");
  const p = await import("../src/lib/prospection");
  const db = getDb();
  const a = await ensureContact("fatou@clinique.sn", { firstName: "Fatou", company: "Clinique Dakar", tags: ["prospect"], source: "test" });
  const b = await ensureContact("yao@ong.ci", { firstName: "Yao", tags: ["prospect"], source: "test" });
  await ensureContact("refus@ong.ci", { firstName: "Non", tags: ["prospect"], source: "test" });
  const refus = (await db.select().from(schema.contacts).where(eq(schema.contacts.email, "refus@ong.ci")))[0]!;
  await p.setNoBulk(refus.id, true);

  const id = await p.createOpportunity({
    title: "Audit qualité", kind: "consultation", stage: "piste", contactId: a.id,
    organization: "Clinique Dakar", country: "Sénégal", amount: 2_000_000, currency: "XOF", source: null, notes: "",
  });
  const today = p.todayParis();
  await p.addTask({ title: "Relancer", dueOn: p.addDays(today, -1), opportunityId: id });
  await p.addTask({ title: "Plus tard", dueOn: p.addDays(today, 10), contactId: b.id });

  // Le rappel d'une affaire est rattaché au contact de l'affaire.
  const due = await p.openTasks({ until: today });
  assert.deepEqual(due.map((r) => [r.t.title, r.t.contactId, r.opportunityTitle]), [["Relancer", a.id, "Audit qualité"]]);
  const [list] = await p.listOpportunities({ contactId: a.id });
  assert.equal(list!.nextTask, p.addDays(today, -1));

  // Reporter un rappel en retard part d'aujourd'hui.
  await p.postponeTask(due[0]!.t.id, 1);
  assert.equal((await p.openTasks({ opportunityId: id }))[0]!.t.dueOn, p.addDays(today, 1));
  await p.setTaskDone(due[0]!.t.id, true);
  assert.equal((await p.openTasks({ opportunityId: id })).length, 0);

  assert.deepEqual((await p.pipelineSummary())[0], { stage: "piste", count: 1, totals: [p.formatAmount(2_000_000, "XOF")] });
  await p.moveOpportunity(id, "gagnee");
  assert.ok((await p.getOpportunity(id))!.closedAt instanceof Date);

  // Envoi groupé : un email par personne, sans celle qui a refusé.
  const { count } = await p.queueBulk({ tag: "prospect", subject: "Offre pour {organisation}", body: "Bonjour {prenom}," });
  assert.equal(count, 2);
  const mails = await db.select().from(schema.outbox).where(eq(schema.outbox.subject, "Offre pour Clinique Dakar"));
  assert.equal(mails.length, 1);
  assert.equal(mails[0]!.toEmail, "fatou@clinique.sn");
  assert.match(mails[0]!.text, /^Bonjour Fatou,\n\nSi vous préférez/);
  const yao = await db.select().from(schema.outbox).where(eq(schema.outbox.toEmail, "yao@ong.ci"));
  assert.equal(yao[0]!.subject, "Offre pour");
  await assert.rejects(p.queueBulk({ tag: "inconnue", subject: "x", body: "y" }), /Aucun contact/);

  await p.deleteOpportunity(id);
  assert.equal(await p.getOpportunity(id), null);
});

test("visios : invitation, rappel du jour, annulation", { skip }, async () => {
  const { ensureContact } = await import("../src/lib/contacts");
  const v = await import("../src/lib/meetings");
  const p = await import("../src/lib/prospection");
  const db = getDb();
  const c = await ensureContact("ama@clinique.tg", { firstName: "Ama", source: "test" });
  const at = new Date(Date.now() + 3 * 86400_000);
  const { id, room } = await v.scheduleMeeting({ contactId: c.id, opportunityId: null, title: "Consultation", startsAt: at, durationMin: 45, message: "Échangeons." });
  const [invite] = await db.select().from(schema.outbox).where(eq(schema.outbox.subject, "Visio : Consultation"));
  assert.equal(invite!.toEmail, "ama@clinique.tg");
  assert.ok(invite!.html.includes(`<a href="https://meet.jit.si/${room}">`));
  const day = at.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const tasks = await p.openTasks({ contactId: c.id });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]!.t.dueOn, day);
  assert.match(tasks[0]!.t.title, /^Visio à \d\d h \d\d : Consultation$/);
  assert.equal((await v.upcomingMeetings({ contactId: c.id }))[0]!.url, `https://meet.jit.si/${room}`);

  await v.cancelMeeting(id);
  await v.cancelMeeting(id); // deux clics : un seul email d'annulation
  assert.equal((await v.upcomingMeetings({ contactId: c.id })).length, 0);
  assert.equal((await p.openTasks({ contactId: c.id })).length, 0);
  const cancels = await db.select().from(schema.outbox).where(eq(schema.outbox.subject, "Annulation : visio Consultation"));
  assert.equal(cancels.length, 1);
});
