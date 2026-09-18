import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Le cache client des routes dynamiques.
     *
     * Tous les écrans du jeu sont dynamiques : sans cette fenêtre, revenir sur
     * un onglet qu'on vient de quitter redemandait tout au serveur. Vingt
     * secondes suffisent à rendre les allers-retours instantanés sans jamais
     * montrer un classement d'hier — et une action du joueur (pronostic,
     * message, pouvoir) invalide sa route au passage, donc ses propres gestes
     * restent visibles tout de suite.
     */
    staleTimes: { dynamic: 20, static: 300 },
  },
};

export default nextConfig;
