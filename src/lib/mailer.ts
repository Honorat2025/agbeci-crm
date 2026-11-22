import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getMailSettings } from "./settings";

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

  constructor(
    private readonly address: string,
    password: string,
    private readonly fromName: string,
  ) {
    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: address, pass: password },
    });
  }

  async send(mail: OutgoingMail) {
    const info = await this.transporter.sendMail({
      from: { name: this.fromName, address: this.address },
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

/**
 * Gmail si une connexion est enregistrée (page Réglages ou variables du serveur),
 * sinon envoi simulé. Relu à chaque passage du worker pour prendre en compte
 * un changement de réglages sans redémarrer.
 */
export async function createMailer(): Promise<{ mailer: Mailer; mode: "gmail" | "simulé" }> {
  const s = await getMailSettings();
  return s.configured
    ? { mailer: new GmailMailer(s.address, s.password, s.fromName), mode: "gmail" }
    : { mailer: new LogMailer(), mode: "simulé" };
}
