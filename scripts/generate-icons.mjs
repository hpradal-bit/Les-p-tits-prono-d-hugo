#!/usr/bin/env node
/**
 * Génère les icônes PWA dans public/icons/ — ballon de rugby stylisé, vert
 * sapin sur fond craie.
 *
 *   node scripts/generate-icons.mjs
 *
 * Aucune dépendance : l'encodeur PNG tient en une cinquantaine de lignes et
 * n'utilise que `node:zlib`. Le rendu se fait par sur-échantillonnage 4×4,
 * ce qui suffit largement pour trois images de moins de 512 px.
 *
 * Sortie :
 *   icon-192.png       — icône « any », plein cadre
 *   icon-512.png       — idem, haute définition
 *   maskable-512.png   — icône « maskable » : le ballon tient dans la zone
 *                        sûre (cercle central de 80 %), le fond déborde.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

/* --------------------------------------------------------------------------
   Palette — alignée sur les jetons de src/app/globals.css
   -------------------------------------------------------------------------- */

const GROUND = [0xf2, 0xf4, 0xf0]; // craie : --ground
const PINE = [0x14, 0x66, 0x3f]; // vert terrain : --pine
const LACE = [0xf7, 0xfa, 0xf6]; // lacet, presque blanc

/* --------------------------------------------------------------------------
   Encodeur PNG minimal (RGB 8 bits, non entrelacé)
   -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** `pixels` : Buffer RGB de width × height × 3 octets. */
function encodePng(width, height, pixels) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtre « None »
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // couleur : truecolor RGB
  ihdr[10] = 0; // compression deflate
  ihdr[11] = 0; // filtrage adaptatif
  ihdr[12] = 0; // pas d'entrelacement

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------------------
   Le dessin
   --------------------------------------------------------------------------
   Tout est exprimé en fraction de la taille de l'image : le même code sert
   pour 192 et 512 px. Repère tourné de -22° pour incliner le ballon.
   -------------------------------------------------------------------------- */

const ANGLE = (-22 * Math.PI) / 180;
const COS = Math.cos(ANGLE);
const SIN = Math.sin(ANGLE);

/** Couleur d'un point (x, y) exprimé en fraction de l'image, dans [0, 1]. */
function sample(x, y, geom) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const u = dx * COS + dy * SIN; // le long du grand axe du ballon
  const v = -dx * SIN + dy * COS; // le long du petit axe

  const inBall = (u / geom.rx) ** 2 + (v / geom.ry) ** 2 <= 1;
  if (!inBall) return GROUND;

  // Lacet central : une barre le long du grand axe…
  if (Math.abs(u) <= geom.seamHalf && Math.abs(v) <= geom.seamThick) return LACE;

  // …traversée de cinq points de couture.
  for (let k = -2; k <= 2; k++) {
    const uk = k * geom.stitchGap;
    if (Math.abs(u - uk) <= geom.stitchThick && Math.abs(v) <= geom.stitchHalf) return LACE;
  }

  return PINE;
}

/** Rendu avec sur-échantillonnage 4×4 : les bords de l'ellipse restent nets. */
function render(size, geom) {
  const SS = 4;
  const out = Buffer.alloc(size * size * 3);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, geom);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 3;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
    }
  }
  return out;
}

/** Proportions du ballon, dérivées de son demi-grand axe. */
function geometry(rx) {
  return {
    rx,
    ry: rx * 0.62,
    seamHalf: rx * 0.46,
    seamThick: 0.021,
    stitchGap: rx * 0.21,
    stitchThick: 0.019,
    stitchHalf: 0.074,
  };
}

/* --------------------------------------------------------------------------
   Écriture
   -------------------------------------------------------------------------- */

// « any » : plein cadre. iOS et Android arrondissent eux-mêmes les angles.
const FULL = geometry(0.345);
// « maskable » : le ballon reste dans le cercle sûr de 80 % (rayon 0,4).
const SAFE = geometry(0.275);

const FILES = [
  ["icon-192.png", 192, FULL],
  ["icon-512.png", 512, FULL],
  ["maskable-512.png", 512, SAFE],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size, geom] of FILES) {
  const png = encodePng(size, size, render(size, geom));
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`  ${name.padEnd(20)} ${size}×${size}  ${(png.length / 1024).toFixed(1)} Ko`);
}
console.log("  Icônes PWA générées dans public/icons/.");
