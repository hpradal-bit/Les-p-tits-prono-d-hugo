/**
 * Échantillon de réponse ESPN, écrit à la main.
 *
 * L'accès réseau est fermé en développement : ces échantillons sont ce qui
 * tient lieu de contrat. Ils reproduisent la forme documentée de l'API interne
 * `site.api.espn.com/apis/site/v2/sports/rugby/270559/scoreboard`, avec trois
 * cas qui comptent : un match à venir dont l'horaire est publié, un match en
 * cours, un match terminé.
 *
 * ⚠️ À revérifier contre une vraie réponse avant la J1 : c'est une API non
 * documentée, elle peut changer sans préavis.
 */

export const espnScoreboardSample = {
  leagues: [
    {
      id: "270559",
      name: "French Top 14",
      abbreviation: "TOP14",
      season: { year: 2027, displayName: "2026-2027" },
    },
  ],
  events: [
    {
      // Match à venir, horaire publié : c'est lui qui doit confirmer kickoff.
      id: "600123",
      uid: "s:600~l:270559~e:600123",
      date: "2026-09-05T19:05Z",
      name: "ASM Clermont Auvergne at Stade Toulousain",
      shortName: "ASM @ ST",
      competitions: [
        {
          id: "600123",
          date: "2026-09-05T19:05Z",
          venue: { fullName: "Stade Ernest-Wallon", address: { city: "Toulouse" } },
          status: {
            clock: 0,
            displayClock: "0'",
            period: 0,
            type: { state: "pre", completed: false, name: "STATUS_SCHEDULED" },
          },
          competitors: [
            {
              id: "1001",
              homeAway: "home",
              score: "0",
              team: {
                id: "1001",
                displayName: "Stade Toulousain",
                name: "Toulousain",
                shortDisplayName: "Toulouse",
                abbreviation: "TOU",
                location: "Toulouse",
              },
            },
            {
              id: "1002",
              homeAway: "away",
              score: "0",
              team: {
                id: "1002",
                displayName: "ASM Clermont Auvergne",
                name: "Clermont Auvergne",
                shortDisplayName: "Clermont",
                abbreviation: "CLE",
                location: "Clermont-Ferrand",
              },
            },
          ],
        },
      ],
    },
    {
      // Match en cours : ESPN compte l'horloge en secondes.
      id: "600124",
      date: "2026-09-05T16:30Z",
      name: "Union Bordeaux-Bègles at Racing 92",
      competitions: [
        {
          id: "600124",
          date: "2026-09-05T16:30Z",
          venue: { fullName: "Stade Chaban-Delmas" },
          status: {
            clock: 3180,
            displayClock: "53'",
            period: 2,
            type: { state: "in", completed: false, name: "STATUS_IN_PROGRESS" },
          },
          competitors: [
            {
              id: "1003",
              homeAway: "home",
              score: "17",
              team: {
                id: "1003",
                displayName: "Union Bordeaux Begles",
                name: "Bordeaux Begles",
                shortDisplayName: "Bordeaux",
                abbreviation: "UBB",
                location: "Bordeaux",
              },
            },
            {
              id: "1004",
              homeAway: "away",
              score: "12",
              team: {
                id: "1004",
                displayName: "Racing 92",
                name: "Racing 92",
                shortDisplayName: "Racing",
                abbreviation: "R92",
                location: "Paris",
              },
            },
          ],
        },
      ],
    },
    {
      // Match terminé.
      id: "600125",
      date: "2026-09-05T12:30Z",
      name: "Aviron Bayonnais at RC Toulon",
      competitions: [
        {
          id: "600125",
          date: "2026-09-05T12:30Z",
          venue: { fullName: "Stade Jean-Dauger" },
          status: {
            clock: 4800,
            displayClock: "80'",
            period: 2,
            type: { state: "post", completed: true, name: "STATUS_FINAL" },
          },
          competitors: [
            {
              id: "1005",
              homeAway: "home",
              score: "27",
              team: {
                id: "1005",
                displayName: "Aviron Bayonnais",
                name: "Bayonnais",
                shortDisplayName: "Bayonne",
                abbreviation: "BAY",
                location: "Bayonne",
              },
            },
            {
              id: "1006",
              homeAway: "away",
              score: "27",
              team: {
                id: "1006",
                displayName: "RC Toulon",
                name: "Toulon",
                shortDisplayName: "Toulon",
                abbreviation: "TLN",
                location: "Toulon",
              },
            },
          ],
        },
      ],
    },
  ],
};

/** Même endpoint, mais la LNR n'a pas encore publié l'heure : minuit UTC. */
export const espnScoreboardWithoutTimeSample = {
  events: [
    {
      id: "600200",
      date: "2027-01-09T00:00Z",
      competitions: [
        {
          id: "600200",
          date: "2027-01-09T00:00Z",
          status: { type: { state: "pre", completed: false, name: "STATUS_SCHEDULED" } },
          competitors: [
            {
              homeAway: "home",
              score: "0",
              team: { id: "1007", displayName: "Section Paloise", abbreviation: "PAU" },
            },
            {
              homeAway: "away",
              score: "0",
              team: { id: "1008", displayName: "USA Perpignan", abbreviation: "PER" },
            },
          ],
        },
      ],
    },
  ],
};

/** Match reporté : le statut doit passer, l'horaire non. */
export const espnPostponedSample = {
  events: [
    {
      id: "600300",
      date: "2026-12-19T14:00Z",
      competitions: [
        {
          id: "600300",
          date: "2026-12-19T14:00Z",
          status: { type: { state: "post", completed: false, name: "STATUS_POSTPONED" } },
          competitors: [
            {
              homeAway: "home",
              score: "0",
              team: { id: "1009", displayName: "RC Vannes", abbreviation: "VAN" },
            },
            {
              homeAway: "away",
              score: "0",
              team: { id: "1010", displayName: "Castres Olympique", abbreviation: "CAS" },
            },
          ],
        },
      ],
    },
  ],
};

/** Le classement, tel que le renvoie `apis/v2/sports/rugby/270559/standings`. */
export const espnStandingsSample = {
  name: "Top 14",
  children: [
    {
      name: "Regular Season",
      standings: {
        entries: [
          {
            team: {
              id: "1001",
              displayName: "Stade Toulousain",
              shortDisplayName: "Toulouse",
              abbreviation: "TOU",
              location: "Toulouse",
            },
            stats: [
              { name: "rank", value: 1, displayValue: "1" },
              { name: "gamesPlayed", value: 3, displayValue: "3" },
              { name: "wins", value: 3, displayValue: "3" },
              { name: "ties", value: 0, displayValue: "0" },
              { name: "losses", value: 0, displayValue: "0" },
              { name: "pointsFor", value: 97, displayValue: "97" },
              { name: "pointsAgainst", value: 48, displayValue: "48" },
              { name: "bonusPointsTry", value: 2, displayValue: "2" },
              { name: "bonusPointsLosing", value: 0, displayValue: "0" },
              { name: "points", value: 14, displayValue: "14" },
            ],
          },
          {
            team: {
              id: "1003",
              displayName: "Union Bordeaux Begles",
              shortDisplayName: "Bordeaux",
              abbreviation: "UBB",
              location: "Bordeaux",
            },
            stats: [
              { name: "rank", value: 2, displayValue: "2" },
              { name: "gamesPlayed", value: 3, displayValue: "3" },
              { name: "wins", value: 2, displayValue: "2" },
              { name: "ties", value: 1, displayValue: "1" },
              { name: "losses", value: 0, displayValue: "0" },
              { name: "pointsFor", value: 74, displayValue: "74" },
              { name: "pointsAgainst", value: 55, displayValue: "55" },
              { name: "points", value: 11, displayValue: "11" },
            ],
          },
        ],
      },
    },
  ],
};
