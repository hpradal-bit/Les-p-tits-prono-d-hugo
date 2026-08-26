import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isKindEnabledFor,
  mergePreferences,
  settableKinds,
  type CatalogEntry,
} from "./preferences.ts";

const entry = (over: Partial<CatalogEntry> & { kind: string }): CatalogEntry => ({
  emoji: "🔔",
  label: "Un type",
  description: "Sa description",
  wired: true,
  default_enabled: true,
  ...over,
});

describe("mergePreferences", () => {
  it("sans choix du joueur, le defaut actif du catalogue s'applique", () => {
    const out = mergePreferences([entry({ kind: "exact_score" })], []);
    assert.equal(out.length, 1);
    assert.equal(out[0].enabled, true);
    assert.equal(out[0].isExplicit, false);
  });

  it("sans choix du joueur, un defaut inactif reste inactif", () => {
    const out = mergePreferences(
      [entry({ kind: "overtake", default_enabled: false })],
      [],
    );
    assert.equal(out[0].enabled, false);
    assert.equal(out[0].isExplicit, false);
  });

  it("le choix explicite l'emporte sur le defaut, dans les deux sens", () => {
    const catalog = [
      entry({ kind: "coupe", default_enabled: true }),
      entry({ kind: "allume", default_enabled: false }),
    ];
    const out = mergePreferences(catalog, [
      { kind: "coupe", is_enabled: false },
      { kind: "allume", is_enabled: true },
    ]);
    assert.equal(out[0].enabled, false);
    assert.equal(out[0].isExplicit, true);
    assert.equal(out[1].enabled, true);
    assert.equal(out[1].isExplicit, true);
  });

  it("un type non branche reste affiche, mais marque comme tel", () => {
    const out = mergePreferences([entry({ kind: "futur", wired: false })], []);
    assert.equal(out.length, 1);
    assert.equal(out[0].wired, false);
  });

  it("un catalogue vide ne rend rien, meme avec des preferences en base", () => {
    assert.deepEqual(mergePreferences([], [{ kind: "exact_score", is_enabled: false }]), []);
  });

  it("une preference orpheline est ignoree, pas ressuscitee", () => {
    const out = mergePreferences(
      [entry({ kind: "exact_score" })],
      [
        { kind: "exact_score", is_enabled: false },
        { kind: "type_retire_du_catalogue", is_enabled: true },
      ],
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, "exact_score");
  });

  it("l'ordre du catalogue fait foi, pas celui des preferences", () => {
    const catalog = [entry({ kind: "a" }), entry({ kind: "b" }), entry({ kind: "c" })];
    const out = mergePreferences(catalog, [
      { kind: "c", is_enabled: false },
      { kind: "a", is_enabled: false },
    ]);
    assert.deepEqual(out.map((o) => o.kind), ["a", "b", "c"]);
  });

  it("default_enabled absent vaut actif", () => {
    const out = mergePreferences(
      [{ kind: "x", emoji: "🔔", label: "X", description: "", wired: true }],
      [],
    );
    assert.equal(out[0].enabled, true);
  });
});

describe("isKindEnabledFor", () => {
  const catalog = [
    entry({ kind: "exact_score" }),
    entry({ kind: "silencieux", default_enabled: false }),
    entry({ kind: "futur", wired: false }),
  ];

  it("le meme arbitrage qu'a l'ecran : defaut puis choix explicite", () => {
    assert.equal(isKindEnabledFor(catalog, [], "exact_score"), true);
    assert.equal(isKindEnabledFor(catalog, [], "silencieux"), false);
    assert.equal(
      isKindEnabledFor(catalog, [{ kind: "exact_score", is_enabled: false }], "exact_score"),
      false,
    );
    assert.equal(
      isKindEnabledFor(catalog, [{ kind: "silencieux", is_enabled: true }], "silencieux"),
      true,
    );
  });

  it("un type non branche ne part jamais, meme demande explicitement", () => {
    assert.equal(isKindEnabledFor(catalog, [{ kind: "futur", is_enabled: true }], "futur"), false);
  });

  it("un type absent du catalogue ne part pas : non declare, donc inexistant", () => {
    assert.equal(isKindEnabledFor(catalog, [{ kind: "inconnu", is_enabled: true }], "inconnu"), false);
  });
});

describe("settableKinds", () => {
  it("ne retient que les types branches", () => {
    const catalog = [
      entry({ kind: "a" }),
      entry({ kind: "b", wired: false }),
      entry({ kind: "c" }),
    ];
    assert.deepEqual(settableKinds(catalog), ["a", "c"]);
  });

  it("un catalogue vide ne donne rien a regler", () => {
    assert.deepEqual(settableKinds([]), []);
  });
});
