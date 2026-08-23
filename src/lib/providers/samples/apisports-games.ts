/**
 * Échantillon de réponse API-Sports (`api-rugby`), écrit à la main d'après la
 * forme documentée : une enveloppe `{ get, parameters, errors, results,
 * response }`, les erreurs renvoyées en HTTP 200 dans `errors`.
 *
 * ⚠️ À revérifier avec une clé réelle avant de compter dessus (le plan gratuit
 * couvre 100 requêtes par jour).
 */

export const apiSportsGamesSample = {
  get: "games",
  parameters: { league: "16", season: "2026" },
  errors: [],
  results: 3,
  response: [
    {
      id: 77001,
      date: "2026-09-05T21:05:00+02:00",
      time: "21:05",
      timestamp: 1788635100,
      timezone: "UTC",
      week: "Round 1",
      status: { long: "Not Started", short: "NS", timer: null },
      league: { id: 16, name: "Top 14", type: "league", season: 2026, round: "Regular Season - 1" },
      country: { id: 2, name: "France", code: "FR" },
      teams: {
        home: { id: 501, name: "Stade Toulousain", logo: "https://media.api-sports.io/rugby/teams/501.png" },
        away: { id: 502, name: "Clermont Auvergne", logo: "https://media.api-sports.io/rugby/teams/502.png" },
      },
      scores: { home: null, away: null },
      periods: { first: null, second: null, overtime: null },
    },
    {
      id: 77002,
      date: "2026-09-05T18:30:00+02:00",
      timestamp: 1788626100,
      status: { long: "Second Half", short: "2H", timer: 53 },
      league: { id: 16, name: "Top 14", season: 2026, round: "Regular Season - 1" },
      teams: {
        home: { id: 503, name: "Bordeaux Bègles" },
        away: { id: 504, name: "Racing 92" },
      },
      scores: { home: 17, away: 12 },
    },
    {
      id: 77003,
      date: "2026-09-05T14:30:00+02:00",
      timestamp: 1788611400,
      status: { long: "Game Finished", short: "FT", timer: null },
      league: { id: 16, name: "Top 14", season: 2026, round: "Regular Season - 1" },
      teams: {
        home: { id: 505, name: "Aviron Bayonnais" },
        away: { id: 506, name: "RC Toulon" },
      },
      scores: { home: 27, away: 27 },
    },
  ],
};

/** Le quota est épuisé : l'API répond 200 avec une erreur dans `errors`. */
export const apiSportsQuotaErrorSample = {
  get: "games",
  parameters: { league: "16", season: "2026" },
  errors: {
    requests:
      "You have reached the request limit for the day. Your subscription will be renewed at 00:00 UTC.",
  },
  results: 0,
  response: [],
};

/** Classement API-Sports : un tableau de groupes, chacun tableau de lignes. */
export const apiSportsStandingsSample = {
  get: "standings",
  parameters: { league: "16", season: "2026" },
  errors: [],
  results: 1,
  response: [
    [
      {
        position: 1,
        stage: "Regular Season",
        group: { name: "Top 14" },
        team: { id: 501, name: "Stade Toulousain", logo: "…" },
        league: { id: 16, name: "Top 14", season: 2026 },
        country: { name: "France" },
        games: {
          played: 3,
          win: { total: 3, percentage: "1.000" },
          drawn: { total: 0, percentage: "0.000" },
          lost: { total: 0, percentage: "0.000" },
        },
        points: { for: 97, against: 48, bonus: { offensive: 2, defensive: 0 }, total: 14 },
        form: "WWW",
        description: "Play-offs",
      },
      {
        position: 2,
        team: { id: 503, name: "Bordeaux Bègles" },
        games: {
          played: 3,
          win: { total: 2 },
          drawn: { total: 1 },
          lost: { total: 0 },
        },
        points: { for: 74, against: 55, bonus: { offensive: 1, defensive: 0 }, total: 11 },
      },
    ],
  ],
};
