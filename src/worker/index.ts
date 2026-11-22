/**
 * Tâches de fond : vide la file d'emails au rythme autorisé par Gmail.
 * Lancer avec `npm run worker` (un seul worker à la fois).
 */
import { closeDb } from "@/db";
import { createMailer } from "@/lib/mailer";
import { processOutbox, recoverStuck } from "@/lib/queue";
import { markFinishedNewsletters } from "@/lib/newsletters";
import { recordSyncError, syncMailbox, syncState } from "@/lib/mailbox";
import { env } from "@/lib/env";

const TICK_MS = 15_000;
/** Relève de la boîte Gmail : toutes les minutes, ou tout de suite sur demande. */
const MAIL_SYNC_MS = 60_000;
let stopping = false;

let lastMode = "";

async function tick() {
  const { mailer, mode } = await createMailer();
  if (mode !== lastMode) {
    console.log(`Mode d'envoi : ${mode}.`);
    lastMode = mode;
  }
  // En mode simulé, on laisse les emails en attente : ils partiront dès que Gmail sera branché.
  if (mode === "simulé" && process.env.NODE_ENV === "production") {
    await markFinishedNewsletters();
    return;
  }
  const sent = await processOutbox(mailer, { max: 50, intervalMs: env.sendIntervalMs });
  await markFinishedNewsletters();
  if (sent > 0) console.log(`${sent} email(s) envoyé(s).`);
  if (mode === "gmail") await maybeSyncMail(sent > 0);
}

async function maybeSyncMail(justSent: boolean) {
  const state = await syncState();
  const due =
    !state ||
    !state.backfillDone ||
    state.requestedAt !== null ||
    justSent ||
    !state.lastSyncAt ||
    Date.now() - state.lastSyncAt.getTime() >= MAIL_SYNC_MS;
  if (!due) return;
  try {
    // Pendant le rattrapage de l'historique, plusieurs lots d'affilée.
    for (let i = 0; i < 5; i++) {
      const r = await syncMailbox();
      if (!r) return;
      if (r.added > 0) console.log(`Gmail : ${r.added} message(s) recopié(s)${r.backfillDone ? "" : " (historique en cours)"}.`);
      if (r.backfillDone || stopping) break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Relève Gmail impossible :", message);
    await recordSyncError(message);
  }
}

async function main() {
  console.log(`Worker démarré (limite : ${env.dailySendLimit} emails par 24 h).`);
  await recoverStuck();
  while (!stopping) {
    try {
      await tick();
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
