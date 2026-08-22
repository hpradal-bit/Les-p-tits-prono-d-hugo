import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  extensionFor,
  resolveAvatar,
  sniffImageType,
  storagePathFromPublicUrl,
  type ClubAvatar,
} from "./avatars.ts";

/**
 * Ces trois fonctions sont pures : elles se testent sans base ni réseau.
 * Le reniflage est le garde-fou qui empêche un fichier maquillé en image de
 * finir dans le bucket — il mérite d'être vérifié à chaque commit.
 */

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

describe("sniffImageType", () => {
  it("reconnaît un PNG à sa signature", () => {
    assert.equal(
      sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00)),
      "image/png",
    );
  });

  it("reconnaît un JPEG à sa signature", () => {
    assert.equal(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00)), "image/jpeg");
  });

  it("reconnaît un WebP à ses deux marqueurs", () => {
    const header = bytes(
      ...ascii("RIFF"),
      0x24, 0x00, 0x00, 0x00,
      ...ascii("WEBP"),
      0x56, 0x50,
    );
    assert.equal(sniffImageType(header), "image/webp");
  });

  it("refuse un exécutable, quel que soit le nom du fichier", () => {
    assert.equal(sniffImageType(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03)), null);
  });

  it("refuse un RIFF qui n'est pas du WebP (un WAV, par exemple)", () => {
    const wav = bytes(...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WAVE"), 0x66, 0x6d);
    assert.equal(sniffImageType(wav), null);
  });

  it("refuse un fichier trop court pour être identifié", () => {
    assert.equal(sniffImageType(bytes(0x89, 0x50)), null);
  });
});

describe("extensionFor", () => {
  it("impose une extension par type, sans consulter le nom d'origine", () => {
    assert.equal(extensionFor("image/png"), "png");
    assert.equal(extensionFor("image/jpeg"), "jpg");
    assert.equal(extensionFor("image/webp"), "webp");
  });

  it("ne connaît aucune extension pour un type non autorisé", () => {
    assert.equal(extensionFor("image/svg+xml"), null);
  });
});

describe("storagePathFromPublicUrl", () => {
  const base = "https://abc.supabase.co/storage/v1/object/public/avatars";

  it("extrait le chemin de l'objet", () => {
    assert.equal(storagePathFromPublicUrl(`${base}/user-1/photo.png`), "user-1/photo.png");
  });

  it("ignore la chaîne de requête", () => {
    assert.equal(storagePathFromPublicUrl(`${base}/user-1/photo.png?v=2`), "user-1/photo.png");
  });

  it("ne renvoie rien pour une URL étrangère au bucket", () => {
    assert.equal(storagePathFromPublicUrl("https://exemple.fr/photo.png"), null);
    assert.equal(
      storagePathFromPublicUrl(
        "https://abc.supabase.co/storage/v1/object/public/autre/photo.png",
      ),
      null,
    );
  });

  it("refuse une tentative de remontée de dossier", () => {
    assert.equal(storagePathFromPublicUrl(`${base}/../secret.png`), null);
  });
});

describe("resolveAvatar", () => {
  const clubs: ClubAvatar[] = [
    { code: "ST", name: "Toulouse", logoUrl: "/logos/toulouse.png" },
  ];

  it("rend l'emoji tel quel", () => {
    assert.deepEqual(resolveAvatar("emoji", "🔥", clubs), { type: "emoji", emoji: "🔥" });
  });

  it("rend le logo du club à partir de son code", () => {
    assert.deepEqual(resolveAvatar("club", "ST", clubs), {
      type: "image",
      src: "/logos/toulouse.png",
      alt: "Toulouse",
    });
  });

  it("retombe sur un emoji si le club n'existe plus", () => {
    assert.deepEqual(resolveAvatar("club", "XXX", clubs, "🏉"), { type: "emoji", emoji: "🏉" });
  });

  it("rend la photo téléversée", () => {
    const url = "https://abc.supabase.co/storage/v1/object/public/avatars/u/1.png";
    assert.deepEqual(resolveAvatar("photo", url, clubs), {
      type: "image",
      src: url,
      alt: "Photo de profil",
    });
  });

  it("retombe sur l'emoji par défaut si la valeur est vide", () => {
    assert.deepEqual(resolveAvatar("emoji", "", clubs, "🏉"), { type: "emoji", emoji: "🏉" });
  });
});
