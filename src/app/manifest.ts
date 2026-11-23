import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agbeci CRM",
    short_name: "Agbeci CRM",
    description: "Messagerie, contacts, prospection et rappels",
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#6b0f1a",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Messagerie", url: "/app/messages" },
      { name: "Rappels", url: "/app/rappels" },
      { name: "Contacts", url: "/app/contacts" },
    ],
  };
}
