import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/** Compte administrateur (une seule personne : Honorat). */
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Secret TOTP chiffré (AES-256-GCM). */
  totpSecretEnc: text("totp_secret_enc").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const newsletterStatus = pgEnum("newsletter_status", [
  "none",
  "pending",
  "subscribed",
  "unsubscribed",
  "bounced",
]);

/**
 * Une fiche par personne. C'est le socle du CRM : la newsletter n'est qu'un
 * des usages d'un contact.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    /** D'où vient le contact : formulaire du blog, ajout manuel, import... */
    source: text("source").notNull().default("manual"),
    newsletterStatus: newsletterStatus("newsletter_status").notNull().default("none"),
    /** Preuve du consentement (RGPD). */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    consentSource: text("consent_source"),
    consentIp: text("consent_ip"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    /** Empreinte SHA-256 du lien de confirmation (le lien lui-même n'est jamais stocké). */
    confirmTokenHash: text("confirm_token_hash"),
    confirmTokenExpiresAt: timestamp("confirm_token_expires_at", { withTimezone: true }),
    /** Jeton aléatoire et stable pour le lien de désinscription. */
    unsubscribeToken: text("unsubscribe_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contacts_email_unique").on(t.email),
    uniqueIndex("contacts_unsubscribe_token_unique").on(t.unsubscribeToken),
    index("contacts_newsletter_status_idx").on(t.newsletterStatus),
  ],
);

export const campaignStatus = pgEnum("campaign_status", ["draft", "sending", "sent"]);

export const newsletters = pgTable("newsletters", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  /** Courte phrase affichée après l'objet dans la boîte de réception. */
  preheader: text("preheader"),
  bodyMarkdown: text("body_markdown").notNull().default(""),
  status: campaignStatus("status").notNull().default("draft"),
  /** manual, ou wordpress quand le brouillon vient d'un nouvel article. */
  origin: text("origin").notNull().default("manual"),
  originUrl: text("origin_url"),
  recipientsCount: integer("recipients_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const emailKind = pgEnum("email_kind", ["confirm", "welcome", "newsletter", "test"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "sending", "sent", "failed"]);

/**
 * File d'attente de tous les emails. Le worker la vide au rythme autorisé par
 * Gmail (DAILY_SEND_LIMIT par 24 h glissantes).
 */
export const outbox = pgTable(
  "outbox",
  {
    id: serial("id").primaryKey(),
    kind: emailKind("kind").notNull(),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    newsletterId: integer("newsletter_id").references(() => newsletters.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    /** Plus grand = envoyé en premier (confirmations avant newsletters). */
    priority: integer("priority").notNull().default(0),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    notBefore: timestamp("not_before", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("outbox_pending_idx").on(t.status, t.priority, t.id),
    index("outbox_sent_at_idx").on(t.sentAt),
    uniqueIndex("outbox_newsletter_contact_unique").on(t.newsletterId, t.contactId),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type Newsletter = typeof newsletters.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
