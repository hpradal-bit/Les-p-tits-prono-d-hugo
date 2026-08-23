import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Les p'tits pronos d'Hugo",
    short_name: "Les p'tits pronos",
    description: "Pronostics du Top 14 entre amis.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5ead8",
    theme_color: "#c67139",
    lang: "fr",
    categories: ["sports", "games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
