import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { env } from "./env";

export type RenderedEmail = { subject: string; html: string; text: string };

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "b", "i", "u", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "blockquote", "hr", "img", "code", "pre",
];

/** Convertit le texte Markdown d'une newsletter en HTML sûr. */
export function markdownToSafeHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string;
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "title"], img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener" }),
    },
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Version texte brut, pour les messageries qui n'affichent pas le HTML. */
export function htmlToText(html: string): string {
  return sanitizeHtml(
    html
      .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
      .replace(/<\/(p|h[1-4]|li|blockquote)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li>/gi, "- "),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function layout(innerHtml: string, footerHtml: string, preheader?: string | null): string {
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>`
    : "";
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f2">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px">
<tr><td style="padding:32px 28px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.6;color:#1f1f1f">
${innerHtml}
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #e6e6e2;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b6b66">
${footerHtml}
</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:28px 0"><a href="${escapeHtml(href)}" style="background:#1f4e79;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-family:Arial,sans-serif;font-size:16px;display:inline-block">${escapeHtml(label)}</a></p>`;
}

export function unsubscribeUrl(token: string): string {
  return `${env.appUrl}/desinscription?t=${encodeURIComponent(token)}`;
}

export function oneClickUnsubscribeUrl(token: string): string {
  return `${env.appUrl}/api/public/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** En-têtes qui font apparaître le bouton « Se désabonner » dans Gmail et Outlook. */
export function listUnsubscribeHeaders(token: string): Record<string, string> {
  const mailto = env.gmailAddress ? `, <mailto:${env.gmailAddress}?subject=desinscription>` : "";
  return {
    "List-Unsubscribe": `<${oneClickUnsubscribeUrl(token)}>${mailto}`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

const signature = () => escapeHtml(env.mailFromName);

export function confirmEmail(firstName: string | null | undefined, confirmUrl: string): RenderedEmail {
  const hello = firstName ? `Bonjour ${escapeHtml(firstName)},` : "Bonjour,";
  const html = layout(
    `<p>${hello}</p>
<p>Merci de vouloir recevoir ma newsletter. Pour confirmer votre inscription, cliquez sur le bouton ci-dessous.</p>
${button(confirmUrl, "Confirmer mon inscription")}
<p>Ce lien est valable 7 jours. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email : vous ne recevrez rien.</p>
<p>${signature()}</p>`,
    `Vous recevez cet email parce que votre adresse a été saisie sur honoratagbeci.com.`,
  );
  return { subject: "Confirmez votre inscription à la newsletter", html, text: htmlToText(html) };
}

export function welcomeEmail(firstName: string | null | undefined, unsubscribeToken: string): RenderedEmail {
  const hello = firstName ? `Bonjour ${escapeHtml(firstName)},` : "Bonjour,";
  const html = layout(
    `<p>${hello}</p>
<p>Votre inscription est confirmée. Bienvenue !</p>
<p>Vous recevrez mes prochains articles et mes réflexions directement dans votre boîte mail. Vous pouvez répondre à chaque email : je lis toutes les réponses.</p>
<p>${signature()}</p>`,
    footer(unsubscribeToken),
  );
  return { subject: "Bienvenue dans ma newsletter", html, text: htmlToText(html) };
}

function footer(unsubscribeToken: string): string {
  return `Vous recevez cet email car vous êtes inscrit(e) à la newsletter de ${signature()} (honoratagbeci.com).<br>
<a href="${escapeHtml(unsubscribeUrl(unsubscribeToken))}" style="color:#6b6b66">Se désinscrire en un clic</a>`;
}

export function newsletterEmail(
  n: { subject: string; preheader: string | null; bodyMarkdown: string },
  unsubscribeToken: string,
): RenderedEmail {
  const html = layout(markdownToSafeHtml(n.bodyMarkdown), footer(unsubscribeToken), n.preheader);
  return { subject: n.subject, html, text: htmlToText(html) };
}
