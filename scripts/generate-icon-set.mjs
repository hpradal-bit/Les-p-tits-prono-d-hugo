#!/usr/bin/env node
/**
 * Génère les quatre icônes de l'appli à partir d'un logo source (celui
 * qu'Hugo dessine avec Claude Design) : les trois icônes PWA existantes
 * (icon-192, icon-512, maskable-512) plus l'icône dédiée iOS
 * (apple-touch-icon, 180×180) — celle qui manquait jusqu'ici. C'est elle
 * que l'iPhone utilise pour l'icône d'écran d'accueil ; le manifest PWA
 * n'y est pour rien, iOS l'ignore complètement pour ça.
 *
 *   node scripts/generate-icon-set.mjs chemin/vers/logo.png
 *
 * Le fichier source doit être carré (ou proche) et en haute définition —
 * 1024×1024 au moins recommandé, fond transparent accepté. `sharp` fait le
 * retaillage : déjà présent dans le projet (Next.js s'en sert pour
 * l'optimisation d'images), donc aucune dépendance réseau supplémentaire à
 * l'exécution de l'appli — seulement à l'exécution de ce script.
 */

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// Fond des icônes qui doivent être totalement opaques (maskable, apple-touch)
// — le terracotta de la marque (--clay dans src/app/globals.css). Un fond
// transparent y serait rendu noir par iOS, qui ignore la transparence.
const BRAND_BG = "#c67139";

const source = process.argv[2];
if (!source) {
  console.error("Usage : node scripts/generate-icon-set.mjs <chemin-vers-logo.png>");
  process.exit(1);
}
const sourcePath = resolve(source);

mkdirSync(OUT_DIR, { recursive: true });

/** « any » : plein cadre, transparence conservée — l'OS arrondit lui-même les angles. */
async function full(name, size) {
  const out = join(OUT_DIR, name);
  await sharp(sourcePath).resize(size, size, { fit: "cover" }).png().toFile(out);
  console.log(`  ${name.padEnd(24)} ${size}×${size}`);
}

/**
 * Fond opaque plein cadre, logo réduit et centré — pour les icônes que l'OS
 * peut rogner en cercle/squircle (maskable) ou qui n'acceptent pas la
 * transparence (apple-touch-icon).
 */
async function opaque(name, size, logoScale) {
  const out = join(OUT_DIR, name);
  const inner = Math.round(size * logoScale);
  const pad = (size - inner) / 2;
  await sharp(sourcePath)
    .resize(inner, inner, { fit: "contain", background: BRAND_BG })
    .extend({
      top: Math.floor(pad), bottom: Math.ceil(pad),
      left: Math.floor(pad), right: Math.ceil(pad),
      background: BRAND_BG,
    })
    .flatten({ background: BRAND_BG })
    .png()
    .toFile(out);
  console.log(`  ${name.padEnd(24)} ${size}×${size}`);
}

await full("icon-192.png", 192);
await full("icon-512.png", 512);
// Zone sûre « maskable » : le contenu doit tenir dans le cercle central de
// 80 % (rayon 0,4) du W3C — réduit à 70 % par prudence.
await opaque("maskable-512.png", 512, 0.7);
// Apple recommande un logo occupant l'essentiel du cadre, sans marge large.
await opaque("apple-touch-icon.png", 180, 0.82);

console.log(`  Icônes régénérées dans public/icons/ à partir de ${sourcePath}`);
