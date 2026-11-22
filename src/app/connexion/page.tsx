import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { CodeForm, PasswordForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ etape?: string }> }) {
  const session = await getSession();
  if (session.adminId && session.mfaPassed) redirect("/app");
  const { etape } = await searchParams;
  const codeStep = etape === "code" && session.pendingAdminId;
  return (
    <div className="public card">
      <h1>Connexion</h1>
      {codeStep ? <CodeForm /> : <PasswordForm />}
    </div>
  );
}
