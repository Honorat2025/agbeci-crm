/**
 * Tâches de fond : vide la file d'emails au rythme autorisé par Gmail.
 * Lancer avec `npm run worker` (un seul worker à la fois).
 */
import { closeDb } from "@/db";
import { createMailer } from "@/lib/mailer";
import { processOutbox, recoverStuck } from "@/lib/queue";
import { markFinishedNewsletters } from "@/lib/newsletters";
import { env } from "@/lib/env";

const TICK_MS = 30_000;
let stopping = false;

async function tick(mailer: ReturnType<typeof createMailer>) {
  const sent = await processOutbox(mailer, { max: 50, intervalMs: env.sendIntervalMs });
  await markFinishedNewsletters();
  if (sent > 0) console.log(`${sent} email(s) envoyé(s).`);
}

async function main() {
  const mailer = createMailer();
  console.log(`Worker démarré (envoi : ${env.mailTransport}, limite : ${env.dailySendLimit} par 24 h).`);
  await recoverStuck();
  while (!stopping) {
    try {
      await tick(mailer);
    } catch (err) {
      console.error("Erreur du worker :", err);
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  await closeDb();
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log("Arrêt du worker...");
    stopping = true;
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
