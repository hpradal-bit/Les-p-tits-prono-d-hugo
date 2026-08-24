import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createProviderChain, describeError, orderChain, readProviderOrder, runWithFallback,
} from "./registry.ts";
import { ProviderError, type ProviderFixture, type SportsDataProvider } from "./types.ts";

/** Un faux fournisseur : soit il répond, soit il tombe. */
function fake(name: string, behaviour: "ok" | "boom", fixtures: ProviderFixture[] = []): SportsDataProvider {
  const answer = async () => {
    if (behaviour === "boom") throw new ProviderError(name, "service indisponible");
    return { provider: name, data: fixtures, requestsUsed: 1, warnings: [] };
  };
  return {
    name,
    dailyQuota: null,
    getFixtures: answer,
    getLiveScores: answer,
    getStandings: async () => {
      if (behaviour === "boom") throw new ProviderError(name, "service indisponible");
      return { provider: name, data: [], requestsUsed: 1, warnings: [] };
    },
  };
}

// --- Composition de la chaîne ------------------------------------------------

test("chaîne : sans aucune clé, ESPN est seul fournisseur effectif", () => {
  const chain = createProviderChain({});
  const names = chain.providers.map((p) => p.name);
  assert.ok(names.includes("espn"), "ESPN doit toujours être dans la chaîne");
  assert.ok(chain.skipped.some((s) => s.provider === "thesportsdb"));
  assert.ok(chain.skipped.some((s) => s.provider === "highlightly"));
  assert.ok(chain.skipped.some((s) => s.provider === "apisports"));
});

test("chaîne : avec une clé, le secours est en deuxième position", () => {
  const chain = createProviderChain({ apisportsKey: "k", apisportsQuota: 100 });
  assert.ok(chain.providers.map((p) => p.name).includes("apisports"));
  assert.ok(chain.providers.map((p) => p.name).includes("espn"));
});

test("chaîne : quota du jour épuisé → le fournisseur est écarté d'emblée", () => {
  const chain = createProviderChain({
    highlightlyKey: "k",
    highlightlyQuota: 100,
    highlightlyUsedToday: 100,
  });
  assert.ok(!chain.providers.map((p) => p.name).includes("highlightly"));
  assert.ok(chain.skipped.some((s) => s.provider === "highlightly" && /quota/.test(s.reason)));
});

test("chaîne : quota presque atteint → le secours reste disponible", () => {
  const chain = createProviderChain({
    apisportsKey: "k",
    apisportsQuota: 100,
    apisportsUsedToday: 99,
  });
  assert.ok(chain.providers.map((p) => p.name).includes("apisports"));
});

test("chaîne : TheSportsDB en tête quand la clé est présente", () => {
  const chain = createProviderChain({ thesportsdbKey: "123" });
  assert.equal(chain.providers[0].name, "thesportsdb");
});

test("chaîne complète : quatre fournisseurs dans l'ordre", () => {
  const chain = createProviderChain({
    thesportsdbKey: "123",
    highlightlyKey: "rapid-key",
    apisportsKey: "as-key",
  });
  assert.deepEqual(chain.providers.map((p) => p.name), [
    "thesportsdb", "highlightly", "espn", "apisports",
  ]);
  assert.deepEqual(chain.skipped, []);
});

// --- Bascule -----------------------------------------------------------------

const oneFixture: ProviderFixture[] = [
  {
    externalId: "1",
    kickoffAt: "2026-09-05T19:05:00.000Z",
    kickoffPrecise: true,
    status: "scheduled",
    homeTeam: { externalId: "a", name: "Stade Toulousain", aliases: [] },
    awayTeam: { externalId: "b", name: "ASM Clermont Auvergne", aliases: [] },
    homeScore: null,
    awayScore: null,
    minute: null,
    venue: null,
    roundLabel: null,
  },
];

test("bascule : le principal répond, le secours n'est jamais appelé", async () => {
  let secoursAppele = false;
  const secours = fake("apisports", "ok");
  const chain = {
    providers: [
      fake("espn", "ok", oneFixture),
      {
        ...secours,
        getFixtures: async (...args: Parameters<SportsDataProvider["getFixtures"]>) => {
          secoursAppele = true;
          return secours.getFixtures(...args);
        },
      },
    ],
    skipped: [],
  };

  const outcome = await runWithFallback(chain, (p) =>
    p.getFixtures("270559", { from: "2026-09-01", to: "2026-09-30" }),
  );

  assert.equal(outcome.response?.provider, "espn");
  assert.equal(outcome.response?.data.length, 1);
  assert.equal(secoursAppele, false, "le quota d'API-Sports doit rester intact");
  assert.deepEqual(outcome.requestsByProvider, { espn: 1 });
});

test("bascule : ESPN tombe, API-Sports prend le relais", async () => {
  const chain = {
    providers: [fake("espn", "boom"), fake("apisports", "ok", oneFixture)],
    skipped: [],
  };

  const outcome = await runWithFallback(chain, (p) =>
    p.getLiveScores("ref", "2026-09-05"),
  );

  assert.equal(outcome.response?.provider, "apisports");
  assert.equal(outcome.attempts[0].ok, false);
  assert.match(outcome.attempts[0].error ?? "", /service indisponible/);
  assert.equal(outcome.attempts[1].ok, true);
  // L'appel raté compte quand même une requête : le quota est prudent.
  assert.deepEqual(outcome.requestsByProvider, { espn: 1, apisports: 1 });
});

test("bascule : les deux tombent → pas d'exception, une panne racontée", async () => {
  const chain = {
    providers: [fake("espn", "boom"), fake("apisports", "boom")],
    skipped: [],
  };

  const outcome = await runWithFallback(chain, (p) =>
    p.getLiveScores("ref", "2026-09-05"),
  );

  assert.equal(outcome.response, null, "l'appelant garde la dernière donnée connue");
  assert.equal(outcome.attempts.length, 2);
  assert.ok(outcome.attempts.every((a) => !a.ok));
});

test("bascule : un fournisseur écarté figure au journal sans être appelé", async () => {
  const chain = {
    providers: [fake("espn", "ok", oneFixture)],
    skipped: [{ provider: "apisports", reason: "quota journalier atteint (100/100 requêtes)" }],
  };

  const outcome = await runWithFallback(chain, (p) =>
    p.getFixtures("270559", { from: "2026-09-01", to: "2026-09-30" }),
  );

  assert.equal(outcome.attempts[0].provider, "apisports");
  assert.equal(outcome.attempts[0].requestsUsed, 0);
  assert.equal(outcome.response?.provider, "espn");
});

test("bascule : une chaîne vide échoue proprement", async () => {
  const outcome = await runWithFallback({ providers: [], skipped: [] }, (p) =>
    p.getStandings("ref"),
  );
  assert.equal(outcome.response, null);
  assert.deepEqual(outcome.requestsByProvider, {});
});

/**
 * Lisibilité des erreurs.
 *
 * Un message d'erreur illisible équivaut à pas de message : l'administrateur
 * voit que quelque chose a raté, sans rien pour le corriger. Cas vécu — une
 * synchronisation de calendrier a rapporté « correspondance de match non
 * écrite : [object Object] ».
 */
test("une erreur Supabase se lit, au lieu de « [object Object] »", () => {
  // Supabase (PostgREST) lève un objet simple, pas une instance d'`Error` :
  // c'est ce qui prenait `String(error)` en défaut.
  const postgrest = {
    code: "23505",
    message: "duplicate key value violates unique constraint",
    details: "Key (provider, entity_id)=(espn, abc) already exists.",
    hint: null,
  };
  const described = describeError(postgrest);
  assert.match(described, /23505/);
  assert.match(described, /duplicate key/);
  assert.match(described, /already exists/);
  assert.doesNotMatch(described, /\[object Object\]/);
});

test("un objet sans champ connu reste lisible", () => {
  const described = describeError({ statusCode: 502, body: "bad gateway" });
  assert.doesNotMatch(described, /\[object Object\]/);
  assert.match(described, /502|bad gateway/);
});

test("les erreurs déjà lisibles ne changent pas", () => {
  assert.equal(describeError(new ProviderError("espn", "service indisponible")),
    "[espn] service indisponible");
  assert.match(describeError(new TypeError("fetch failed")), /TypeError: fetch failed/);
  assert.equal(describeError("panne sèche"), "panne sèche");
  assert.equal(describeError(null), "null");
});

test("un objet impossible à sérialiser ne fait pas tomber la synchronisation", () => {
  // Une référence circulaire ferait lever `JSON.stringify` — au beau milieu
  // d'un rapport d'erreur, ce serait une erreur cachant l'erreur.
  const cyclique: Record<string, unknown> = { statusCode: 500 };
  cyclique.self = cyclique;
  assert.doesNotThrow(() => describeError(cyclique));
});

/**
 * Ordre de préférence par nature de synchronisation.
 *
 * TheSportsDB en tête partout (30 req/min, pas de quota journalier),
 * Highlightly en second (100 req/jour, API structurée), ESPN en troisième
 * (gratuit mais non documenté), API-Sports en dernier (saisons limitées).
 */
test("TheSportsDB en tête, puis Highlightly, ESPN, API-Sports", () => {
  const chain = {
    providers: [
      fake("thesportsdb", "ok"),
      fake("highlightly", "ok"),
      fake("espn", "ok"),
      fake("apisports", "ok"),
    ],
    skipped: [],
  };

  for (const kind of ["calendar", "live", "standings"] as const) {
    assert.deepEqual(
      orderChain(chain, readProviderOrder(null, kind)).providers.map((p) => p.name),
      ["thesportsdb", "highlightly", "espn", "apisports"],
      kind,
    );
  }
});

test("un ordre venu de la base l'emporte sur les valeurs par défaut", () => {
  const chain = {
    providers: [
      fake("thesportsdb", "ok"),
      fake("highlightly", "ok"),
      fake("espn", "ok"),
      fake("apisports", "ok"),
    ],
    skipped: [],
  };
  const custom = { live: ["espn", "thesportsdb"] };

  assert.deepEqual(
    orderChain(chain, readProviderOrder(custom, "live")).providers.map((p) => p.name),
    ["espn", "thesportsdb", "highlightly", "apisports"],
  );
  // Une nature absente du réglage garde sa valeur par défaut.
  assert.deepEqual(readProviderOrder(custom, "calendar"),
    ["thesportsdb", "highlightly", "espn", "apisports"]);
});

test("une préférence ne fait jamais disparaître un fournisseur", () => {
  // Le secours doit rester joignable même si personne ne l'a nommé : une
  // préférence qui supprime un filet est le contraire de ce qu'on demande.
  const chain = {
    providers: [fake("espn", "ok"), fake("apisports", "ok"), fake("autre", "ok")],
    skipped: [],
  };
  const ordered = orderChain(chain, ["apisports"]);
  assert.equal(ordered.providers.length, 3);
  assert.equal(ordered.providers[0].name, "apisports");
  // Les non-nommés gardent leur rang relatif.
  assert.deepEqual(ordered.providers.slice(1).map((p) => p.name), ["espn", "autre"]);
});

test("un réglage illisible retombe sur les valeurs par défaut", () => {
  const expected = ["thesportsdb", "highlightly", "espn", "apisports"];
  for (const bogus of [null, undefined, "espn", [], { standings: [] }, { standings: [42] }]) {
    assert.deepEqual(readProviderOrder(bogus, "standings"), expected);
  }
});

test("les réglages tolèrent la casse et les espaces", () => {
  assert.deepEqual(readProviderOrder({ live: ["  APISports ", "ESPN"] }, "live"),
    ["apisports", "espn"]);
});
