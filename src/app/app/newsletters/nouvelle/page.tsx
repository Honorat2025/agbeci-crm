import { requireAdmin } from "@/lib/guard";
import { createAction } from "../actions";
import { NewsletterEditor } from "../editor";

export default async function NewNewsletterPage() {
  await requireAdmin();
  return (
    <>
      <h1>Nouvelle newsletter</h1>
      <div className="card">
        <NewsletterEditor
          action={createAction}
          submitLabel="Créer le brouillon"
          initial={{ subject: "", preheader: "", bodyMarkdown: "Bonjour,\n\n\n\nÀ bientôt,\n\nHonorat" }}
        />
      </div>
    </>
  );
}
