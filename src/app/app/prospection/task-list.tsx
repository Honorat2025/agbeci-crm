import Link from "next/link";
import { formatDay, todayParis } from "@/lib/prospection";
import { taskAction } from "./actions";

type TaskRow = {
  t: { id: number; title: string; dueOn: string; doneAt: Date | null; contactId: number | null; opportunityId: number | null };
  contactName: string | null;
  contactEmail: string | null;
  opportunityTitle: string | null;
};

/** Liste de rappels avec les boutons Fait / +1 j / +1 sem. */
export function TaskList({ rows, showLinks = true, empty }: { rows: TaskRow[]; showLinks?: boolean; empty?: string }) {
  if (!rows.length) return <p className="muted">{empty ?? "Aucun rappel."}</p>;
  const today = todayParis();
  return (
    <ul className="tasks">
      {rows.map(({ t, contactName, contactEmail, opportunityTitle }) => {
        const late = !t.doneAt && t.dueOn < today;
        // Un petit formulaire par bouton : l'action reçoit « do » dans un champ caché.
        const act = (what: string, label: React.ReactNode, props: { className: string; title: string }) => (
          <form action={taskAction}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="do" value={what} />
            {t.contactId && <input type="hidden" name="contactId" value={t.contactId} />}
            {t.opportunityId && <input type="hidden" name="opportunityId" value={t.opportunityId} />}
            <button {...props} aria-label={props.title}>{label}</button>
          </form>
        );
        return (
          <li key={t.id} className={t.doneAt ? "done" : late ? "late" : undefined}>
            {act(t.doneAt ? "undo" : "done", t.doneAt ? "✓" : "", { className: "check", title: t.doneAt ? "Remettre à faire" : "Marquer comme fait" })}
            <div className="what">
              <div>{t.title}</div>
              <div className="muted small">
                <span className={late ? "late-date" : undefined}>{t.dueOn === today ? "Aujourd'hui" : formatDay(t.dueOn)}</span>
                {showLinks && t.contactId && <> · <Link href={`/app/contacts/${t.contactId}`}>{contactName || contactEmail}</Link></>}
                {showLinks && t.opportunityId && <> · <Link href={`/app/prospection/${t.opportunityId}`}>{opportunityTitle}</Link></>}
              </div>
            </div>
            {!t.doneAt && (
              <div className="row small">
                {act("+1", "+1 j", { className: "linkbtn", title: "Reporter à demain" })}
                {act("+7", "+1 sem.", { className: "linkbtn", title: "Reporter d'une semaine" })}
                {act("delete", "Suppr.", { className: "linkbtn muted", title: "Supprimer" })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
