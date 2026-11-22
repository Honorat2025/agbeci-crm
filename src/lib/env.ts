/**
 * Lecture centralisée des variables d'environnement.
 * Les valeurs obligatoires sont vérifiées au moment où on en a besoin,
 * pour que les tests puissent tourner sans tout configurer.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

function secret(name: string): string {
  const value = required(name);
  if (value.length < 32) throw new Error(`${name} doit faire au moins 32 caractères`);
  return value;
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5432/crm";
  },
  get sessionSecret() {
    return secret("SESSION_SECRET");
  },
  get encryptionKey() {
    return secret("ENCRYPTION_KEY");
  },
  get setupToken() {
    return process.env.SETUP_TOKEN ?? "";
  },
  get gmailAddress() {
    return process.env.GMAIL_ADDRESS ?? "";
  },
  get gmailAppPassword() {
    return process.env.GMAIL_APP_PASSWORD ?? "";
  },
  get mailFromName() {
    return process.env.MAIL_FROM_NAME ?? "Honorat AGBECI";
  },
  get mailTransport(): "smtp" | "log" {
    return process.env.MAIL_TRANSPORT === "smtp" ? "smtp" : "log";
  },
  get dailySendLimit() {
    return Number(process.env.DAILY_SEND_LIMIT ?? 400);
  },
  get sendIntervalMs() {
    return Number(process.env.SEND_INTERVAL_MS ?? 3000);
  },
  get allowedOrigins() {
    return (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean);
  },
  get wpSharedSecret() {
    return process.env.WP_SHARED_SECRET ?? "";
  },
};
