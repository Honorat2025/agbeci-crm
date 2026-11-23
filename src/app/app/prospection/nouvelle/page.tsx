import Link from "next/link";
import { requireAdmin } from "@/lib/guard";
import { getContact } from "@/lib/contacts";
import { addDays, isKind, todayParis } from "@/lib/prospection";
import { OpportunityForm } from "../forms";
import { contactOptions, CURRENCIES, kindOptions, stageOptions } from "../options";

export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<{ type?: string; contact?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const contact = sp.contact ? await getContact(Number(sp.contact)) : null;
  const contacts = await contactOptions();
  return (
    <>
      <p><Link href={contact ? `/app/contacts/${contact.id}` : "/app/prospection"}>← Retour</Link></p>
      <h1>Nouvelle affaire</h1>
      <div className="card">
        <OpportunityForm
          kinds={kindOptions}
          stages={stageOptions}
          currencies={CURRENCIES}
          contacts={contacts}
          firstTaskDue={addDays(todayParis(), 3)}
          initial={{
            id: null,
            title: "",
            kind: isKind(sp.type) ? sp.type : "client",
            stage: "piste",
            contactId: contact ? String(contact.id) : "",
            organization: contact?.company ?? "",
            country: contact?.country ?? "",
            amount: "",
            currency: "EUR",
            source: "",
            notes: "",
          }}
        />
      </div>
    </>
  );
}
