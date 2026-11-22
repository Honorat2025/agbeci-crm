import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agbeci CRM",
    short_name: "CRM",
    start_url: "/app",
    display: "standalone",
    background_color: "#f6f6f3",
    theme_color: "#1f4e79",
    lang: "fr",
  };
}
