import { requireAdmin } from "@/lib/guard";
import { addDays, openTasks, recentlyDoneTasks, todayParis } from "@/lib/prospection";
import { TaskForm } from "../prospection/forms";
import { contactOptions } from "../prospection/options";
import { TaskList } from "../prospection/task-list";

export default async function RemindersPage() {
  await requireAdmin();
  const today = todayParis();
  const [all, done, contacts] = await Promise.all([openTasks(), recentlyDoneTasks(10), contactOptions()]);
  const week = addDays(today, 7);
  const late = all.filter((r) => r.t.dueOn < today);
  const now = all.filter((r) => r.t.dueOn === today);
  const soon = all.filter((r) => r.t.dueOn > today && r.t.dueOn <= week);
  const later = all.filter((r) => r.t.dueOn > week);

  return (
    <>
      <h1>Rappels</h1>
      <p className="muted">Ce que vous avez prévu de faire : relancer, appeler, envoyer une proposition… Cochez le rond quand c&apos;est fait.</p>
      <div className="card">
        <TaskForm defaultDue={today} contacts={contacts} />
      </div>
      {late.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>En retard ({late.length})</h2>
          <TaskList rows={late} />
        </div>
      )}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Aujourd&apos;hui</h2>
        <TaskList rows={now} empty="Rien de prévu aujourd'hui." />
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Les 7 prochains jours</h2>
        <TaskList rows={soon} empty="Rien de prévu cette semaine." />
      </div>
      {later.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Plus tard</h2>
          <TaskList rows={later} />
        </div>
      )}
      {done.length > 0 && (
        <details className="card">
          <summary>Faits récemment</summary>
          <TaskList rows={done} />
        </details>
      )}
    </>
  );
}
