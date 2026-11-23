import {
  pgTable,
  boolean,
  bigint,
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
    /** Fiche CRM : coordonnées et classement. */
    company: text("company"),
    jobTitle: text("job_title"),
    phone: text("phone"),
    country: text("country"),
    tags: text("tags").array().notNull().default([]),
    /** Ne plus inclure cette personne dans les envois groupés (elle l'a demandé). */
    noBulk: boolean("no_bulk").notNull().default(false),
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

export const emailKind = pgEnum("email_kind", ["confirm", "welcome", "newsletter", "test", "personal"]);
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
    /** Copies et en-têtes de réponse, pour les emails personnels. */
    cc: text("cc"),
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

/**
 * Réglages modifiables depuis l'application (ex. connexion Gmail).
 * Les valeurs sensibles sont chiffrées avant d'être enregistrées.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Emails de Gmail recopiés dans le CRM (dossier « Tous les messages »).
 * Gmail reste la référence : le CRM ne supprime jamais rien chez Gmail.
 */
export const mailMessages = pgTable(
  "mail_messages",
  {
    id: serial("id").primaryKey(),
    /** Identifiant Gmail du message (X-GM-MSGID), stable même si le message change de libellé. */
    gmailId: text("gmail_id").notNull(),
    /** Identifiant Gmail de la conversation (X-GM-THRID). */
    threadId: text("thread_id").notNull(),
    uid: integer("uid").notNull(),
    messageIdHeader: text("message_id_header"),
    inReplyTo: text("in_reply_to"),
    references: text("references"),
    fromEmail: text("from_email").notNull().default(""),
    fromName: text("from_name"),
    to: jsonb("to").$type<{ name?: string; address: string }[]>().notNull().default([]),
    cc: jsonb("cc").$type<{ name?: string; address: string }[]>().notNull().default([]),
    /** Toutes les adresses du message, en minuscules, pour retrouver l'historique d'un contact. */
    participants: text("participants").array().notNull().default([]),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    textBody: text("text_body").notNull().default(""),
    htmlBody: text("html_body"),
    attachments: jsonb("attachments").$type<{ filename: string; size: number; contentType: string }[]>().notNull().default([]),
    labels: text("labels").array().notNull().default([]),
    /** Vrai quand Honorat est l'expéditeur. */
    outgoing: boolean("outgoing").notNull().default(false),
    seen: boolean("seen").notNull().default(false),
    date: timestamp("date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mail_messages_gmail_id_unique").on(t.gmailId),
    index("mail_messages_thread_idx").on(t.threadId, t.date),
    index("mail_messages_date_idx").on(t.date),
    index("mail_messages_uid_idx").on(t.uid),
    index("mail_messages_participants_idx").using("gin", t.participants),
  ],
);

/** Où en est la recopie de Gmail (une seule ligne, id = 1). */
export const mailSync = pgTable("mail_sync", {
  id: integer("id").primaryKey(),
  account: text("account").notNull(),
  mailbox: text("mailbox").notNull(),
  uidValidity: text("uid_validity").notNull(),
  /** Plus grand UID déjà recopié (messages récents). */
  lastUid: integer("last_uid").notNull().default(0),
  /** Plus petit UID déjà recopié (rattrapage de l'historique, vers le passé). */
  backfillBeforeUid: integer("backfill_before_uid").notNull(),
  backfillDone: boolean("backfill_done").notNull().default(false),
  highestModseq: bigint("highest_modseq", { mode: "bigint" }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
});

/** Actions à reporter dans Gmail par le worker (ex. marquer comme lu). */
export const mailActions = pgTable("mail_actions", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  uids: integer("uids").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Notes libres sur un contact. */
export const contactNotes = pgTable(
  "contact_notes",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contact_notes_contact_idx").on(t.contactId, t.createdAt)],
);

export type MailMessage = typeof mailMessages.$inferSelect;
export type ContactNote = typeof contactNotes.$inferSelect;

/** Types de pistes suivies par Honorat. */
export const OPPORTUNITY_KINDS = ["client", "consultation", "prestation", "emploi", "autre"] as const;
/** Étapes, dans l'ordre. */
export const OPPORTUNITY_STAGES = ["piste", "contact", "proposition", "negociation", "gagnee", "perdue"] as const;

/** Une affaire en cours : mission, consultation, prestation ou poste. */
export const opportunities = pgTable(
  "opportunities",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    kind: text("kind").$type<(typeof OPPORTUNITY_KINDS)[number]>().notNull().default("client"),
    stage: text("stage").$type<(typeof OPPORTUNITY_STAGES)[number]>().notNull().default("piste"),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    organization: text("organization"),
    country: text("country"),
    /** Montant estimé, en unités entières (pas de centimes). */
    amount: integer("amount"),
    currency: text("currency").notNull().default("EUR"),
    source: text("source"),
    notes: text("notes").notNull().default(""),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("opportunities_stage_idx").on(t.stage), index("opportunities_contact_idx").on(t.contactId)],
);

/** Rappels : « relancer M. Diallo le 5 décembre ». */
export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    /** Jour prévu (AAAA-MM-JJ, heure de Paris). */
    dueOn: text("due_on").notNull(),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_due_idx").on(t.doneAt, t.dueOn)],
);

/** Historique des envois groupés personnalisés. */
export const bulkSends = pgTable("bulk_sends", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  tag: text("tag").notNull(),
  recipients: integer("recipients").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Opportunity = typeof opportunities.$inferSelect;
export type Task = typeof tasks.$inferSelect;
