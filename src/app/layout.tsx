import type { Metadata, Viewport } from "next";
import { Caprasimo, Figtree, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Caprasimo : la police de titres de la maquette « Cuir & craie ».
// Une seule graisse, c'est voulu — le caractère vient de la forme, pas du gras.
const display = Caprasimo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const body = Figtree({
  variable: "--font-sans-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-data",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "LE VESTIAIRE",
    template: "%s · LE VESTIAIRE",
  },
  description: "Des potes, des pronos, du kiff.",
  applicationName: "LE VESTIAIRE",
  appleWebApp: {
    capable: true,
    title: "LE VESTIAIRE",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // iOS ignore le manifest PWA pour l'icône d'écran d'accueil : sans ce
    // lien dédié, il se rabat sur une capture d'écran de la page. Générée
    // (avec les trois autres) par `npm run icons:generate`.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5ead8" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1916" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
