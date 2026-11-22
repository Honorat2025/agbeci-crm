import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticator } from "otplib";
import { encrypt, decrypt, safeEqual, sha256, randomToken } from "../src/lib/crypto";
import { subscribeSchema } from "../src/lib/validation";
import { markdownToSafeHtml, newsletterEmail, listUnsubscribeHeaders, htmlToText } from "../src/lib/email-templates";
import { remainingQuota, retryDelayMs } from "../src/lib/queue";
import { rateLimit, resetRateLimits } from "../src/lib/ratelimit";
import { verifyTotp, newTotpSecret, passwordProblem } from "../src/lib/auth";

// Les variables sont lues au moment de l'appel, pas à l'import.

process.env.ENCRYPTION_KEY = "k".repeat(40);
process.env.APP_URL = "https://crm.example.test";
process.env.GMAIL_ADDRESS = "moi@gmail.com";


test("chiffrement aller-retour", () => {
  const secret = "s".repeat(40);
  const enc = encrypt("JBSWY3DPEHPK3PXP", secret);
  assert.notEqual(enc, "JBSWY3DPEHPK3PXP");
  assert.equal(decrypt(enc, secret), "JBSWY3DPEHPK3PXP");
  assert.throws(() => decrypt(enc, "x".repeat(40)));
});

test("jetons et comparaisons", () => {
  const t = randomToken();
  assert.ok(t.length >= 40);
  assert.notEqual(t, randomToken());
  assert.equal(sha256("a"), sha256("a"));
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
});

test("validation de l'inscription", () => {
  const ok = subscribeSchema.safeParse({ email: "  Jean@Example.COM ", consent: true, firstName: "" });
  assert.ok(ok.success);
  assert.equal(ok.data?.email, "jean@example.com");
  assert.equal(ok.data?.firstName, undefined);
  assert.ok(!subscribeSchema.safeParse({ email: "pas-un-email", consent: true }).success);
  assert.ok(!subscribeSchema.safeParse({ email: "a@b.co", consent: false }).success);
  const robot = subscribeSchema.safeParse({ email: "a@b.co", consent: true, website: "http://spam" });
  assert.ok(!robot.success);
  assert.equal(robot.error?.issues[0]?.path[0], "website");
});

test("le HTML des newsletters est nettoyé", () => {
  const html = markdownToSafeHtml('Bonjour **toi**\n\n<script>alert(1)</script>\n\n[lien](javascript:alert(1)) [ok](https://a.b)');
  assert.match(html, /<strong>toi<\/strong>/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /href="https:\/\/a.b"/);
});

test("chaque newsletter contient son lien de désinscription", () => {
  const mail = newsletterEmail({ subject: "Sujet", preheader: "Accroche", bodyMarkdown: "Texte" }, "tok123");
  assert.equal(mail.subject, "Sujet");
  assert.match(mail.html, /desinscription\?t=tok123/);
  assert.match(mail.html, /Accroche/);
  assert.match(mail.text, /Se désinscrire/);
  const h = listUnsubscribeHeaders("tok123");
  assert.match(h["List-Unsubscribe"]!, /api\/public\/unsubscribe\?t=tok123/);
  assert.match(h["List-Unsubscribe"]!, /mailto:moi@gmail.com/);
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("texte brut lisible", () => {
  assert.equal(htmlToText('<p>Salut</p><p><a href="https://x.y">ici</a></p>'), "Salut\n\nici (https://x.y)");
});

test("quota quotidien et délais de nouvel essai", () => {
  assert.equal(remainingQuota(0, 400), 400);
  assert.equal(remainingQuota(390, 400), 10);
  assert.equal(remainingQuota(450, 400), 0);
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(2), 300_000);
  assert.ok(retryDelayMs(20) <= 6 * 3600_000);
});

test("limiteur de tentatives", () => {
  resetRateLimits();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) assert.ok(rateLimit("k", 3, 1000, now));
  assert.ok(!rateLimit("k", 3, 1000, now));
  assert.ok(rateLimit("k", 3, 1000, now + 1001));
});

test("double authentification et mot de passe", () => {
  const secret = newTotpSecret();
  assert.ok(verifyTotp(authenticator.generate(secret), secret));
  assert.ok(!verifyTotp("000000x", secret));
  assert.ok(passwordProblem("court"));
  assert.equal(passwordProblem("une phrase assez longue"), null);
});
