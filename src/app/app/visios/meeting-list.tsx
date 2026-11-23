import { describeWhen, shortWhen, type upcomingMeetings } from "@/lib/meetings";
import { whatsappLink, whatsappNumber } from "@/lib/whatsapp";
import Link from "next/link";
import { cancelMeetingAction } from "./actions";

type Row = Awaited<ReturnType<typeof upcomingMeetings>>[number];

export function MeetingList({ rows, showWho = true, empty }: { rows: Row[]; showWho?: boolean; empty?: string }) {
  if (!rows.length) return empty ? <p className="muted">{empty}</p> : null;
  return (
    <ul className="tasks">
      {rows.map((r) => {
        const wa = whatsappNumber(r.phone, r.country);
        const waText = `Bonjour${r.firstName ? ` ${r.firstName}` : ""},\n\nJe vous confirme notre visio « ${r.m.title} » le ${describeWhen(r.m.startsAt)}.\n\nLien pour nous rejoindre : ${r.url}\n\nÀ bientôt,\nHonorat AGBECI`;
        return (
        <li key={r.m.id}>
          <span aria-hidden="true" style={{ fontSize: "1.1rem" }}>🎥</span>
          <div className="what">
            <div><strong>{shortWhen(r.m.startsAt)}</strong> · {r.m.title}</div>
            <div className="muted small">
              {r.provider === "meet" ? "Google Meet" : "Jitsi"} · {r.m.durationMin} min
              {showWho && <> · <Link href={`/app/contacts/${r.m.contactId}`}>{r.name}</Link></>}
              {showWho && r.m.opportunityId && <> · <Link href={`/app/prospection/${r.m.opportunityId}`}>{r.opportunityTitle}</Link></>}
            </div>
          </div>
          <div className="row small">
            <a className="btn" style={{ padding: "4px 12px" }} href={r.url} target="_blank" rel="noopener noreferrer">Rejoindre</a>
            {wa && (
              <a className="btn whatsapp" style={{ padding: "4px 12px" }} href={whatsappLink(wa, waText)} target="_blank" rel="noopener noreferrer" title="Ouvre WhatsApp avec l'invitation déjà écrite">
                Envoyer sur WhatsApp
              </a>
            )}
            <details>
              <summary className="linkbtn muted">Annuler</summary>
              <form action={cancelMeetingAction} style={{ marginTop: 6 }}>
                <input type="hidden" name="id" value={r.m.id} />
                <input type="hidden" name="contactId" value={r.m.contactId} />
                {r.m.opportunityId && <input type="hidden" name="opportunityId" value={r.m.opportunityId} />}
                <button className="btn danger" style={{ padding: "4px 10px" }}>Annuler et prévenir {r.firstName ?? "la personne"}</button>
              </form>
            </details>
          </div>
        </li>
        );
      })}
    </ul>
  );
}
