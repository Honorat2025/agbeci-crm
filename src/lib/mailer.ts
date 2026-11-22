import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "./env";

export type OutgoingMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export interface Mailer {
  send(mail: OutgoingMail): Promise<{ messageId: string }>;
}

/** Envoi réel par le serveur SMTP de Gmail, avec un mot de passe d'application. */
export class GmailMailer implements Mailer {
  private transporter: Transporter;

  constructor() {
    if (!env.gmailAddress || !env.gmailAppPassword) {
      throw new Error("GMAIL_ADDRESS et GMAIL_APP_PASSWORD sont nécessaires pour envoyer des emails.");
    }
    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: env.gmailAddress, pass: env.gmailAppPassword },
    });
  }

  async send(mail: OutgoingMail) {
    const info = await this.transporter.sendMail({
      from: { name: env.mailFromName, address: env.gmailAddress },
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
    });
    return { messageId: String(info.messageId) };
  }
}

/** Mode développement : n'envoie rien, affiche seulement l'email dans les journaux. */
export class LogMailer implements Mailer {
  sent: OutgoingMail[] = [];
  async send(mail: OutgoingMail) {
    this.sent.push(mail);
    console.log(`[email simulé] à ${mail.to} : ${mail.subject}`);
    return { messageId: `log-${Date.now()}-${this.sent.length}` };
  }
}

export function createMailer(): Mailer {
  return env.mailTransport === "smtp" ? new GmailMailer() : new LogMailer();
}
