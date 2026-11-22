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
