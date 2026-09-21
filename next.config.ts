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
    /**
     * Par défaut, Next.js refuse tout appel de Server Action au-delà d'1 Mo —
     * bien en dessous d'une photo de téléphone (jusqu'à 8 Mo, `MAX_IMAGE_BYTES`)
     * ou d'un vocal (jusqu'à 6 Mo, `MAX_AUDIO_BYTES`). Confirmé en production :
     * `Error: Body exceeded 1 MB limit.` sur /vestiaire, plusieurs joueurs,
     * chaque envoi de photo. Next.js compte les octets de `multipart/form-data`
     * lui-même (limites, en-têtes de partie) en plus du fichier — marge au-delà
     * du plus gros fichier accepté.
     */
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
