import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LE VESTIAIRE",
    short_name: "VESTIAIRE",
    description: "Des potes, des pronos, du kiff.",
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
