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
    default: "Les p'tits pronos d'Hugo",
    template: "%s · Les p'tits pronos d'Hugo",
  },
  description: "Pronostics du Top 14 entre amis.",
  applicationName: "Les p'tits pronos",
  appleWebApp: {
    capable: true,
    title: "Les p'tits pronos",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
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
