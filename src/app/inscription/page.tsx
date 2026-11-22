import type { Metadata } from "next";
import { SubscribeForm } from "./form";

export const metadata: Metadata = {
  title: "Newsletter d'Honorat AGBECI",
  robots: { index: true, follow: true },
};

export default function SubscribePage() {
  return (
    <div className="public card">
      <h1>La newsletter d&apos;Honorat AGBECI</h1>
      <p>Recevez mes nouveaux articles et mes réflexions directement dans votre boîte mail.</p>
      <SubscribeForm />
    </div>
  );
}
