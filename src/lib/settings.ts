import nodemailer from "nodemailer";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decryptSecret, encryptSecret } from "./auth";
import { env } from "./env";

const { settings } = schema;
const KEYS = { address: "gmail_address", password: "gmail_app_password_enc", fromName: "mail_from_name" } as const;

export type MailSettings = {
  address: string;
  password: string;
  fromName: string;
  /** Vrai quand un envoi réel par Gmail est possible. */
  configured: boolean;
  source: "application" | "serveur" | "aucune";
};

/**
 * Connexion Gmail : d'abord celle saisie dans l'application (page Réglages),
 * sinon celle des variables du serveur, sinon aucune (emails seulement simulés).
 */
export async function getMailSettings(): Promise<MailSettings> {
  const rows = await getDb()
    .select()
    .from(settings)
    .where(inArray(settings.key, Object.values(KEYS)));
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  const fromName = get(KEYS.fromName) || env.mailFromName;
  const address = get(KEYS.address);
  const enc = get(KEYS.password);
  if (address && enc) {
    return { address, password: decryptSecret(enc), fromName, configured: true, source: "application" };
  }
  if (env.mailTransport === "smtp" && env.gmailAddress && env.gmailAppPassword) {
    return { address: env.gmailAddress, password: env.gmailAppPassword, fromName, configured: true, source: "serveur" };
  }
  return { address: address || env.gmailAddress, password: "", fromName, configured: false, source: "aucune" };
}

/** Un mot de passe d'application Google : 16 lettres, souvent affichées par groupes de 4. */
export function normalizeAppPassword(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Vérifie auprès de Gmail que l'adresse et le mot de passe d'application fonctionnent. */
export async function verifyGmail(address: string, password: string): Promise<string | null> {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: address, pass: password },
    connectionTimeout: 15_000,
  });
  try {
    await transporter.verify();
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/535|Username and Password not accepted|Invalid login/i.test(msg)) {
      return "Gmail refuse cette adresse ou ce mot de passe d'application. Vérifiez les 16 lettres et l'adresse.";
    }
    return `Impossible de joindre Gmail : ${msg.slice(0, 200)}`;
  } finally {
    transporter.close();
  }
}

export async function saveMailSettings(input: { address: string; password?: string; fromName: string }) {
  const now = new Date();
  const values: { key: string; value: string; updatedAt: Date }[] = [
    { key: KEYS.address, value: input.address, updatedAt: now },
    { key: KEYS.fromName, value: input.fromName, updatedAt: now },
  ];
  if (input.password) values.push({ key: KEYS.password, value: encryptSecret(input.password), updatedAt: now });
  for (const v of values) {
    await getDb()
      .insert(settings)
      .values(v)
      .onConflictDoUpdate({ target: settings.key, set: { value: v.value, updatedAt: now } });
  }
}

export async function clearGmailPassword() {
  await getDb().delete(settings).where(inArray(settings.key, [KEYS.password]));
}
