import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { seasonRewardFor } from "./season-rewards.ts";

describe("seasonRewardFor", () => {
  it("décrit le gage de chaque position pour une ligue à 6 joueurs", () => {
    assert.equal(seasonRewardFor(1, 6)?.tone, "gain");
    assert.match(seasonRewardFor(1, 6)!.label, /maillot/i);
    assert.equal(seasonRewardFor(2, 6)?.tone, "gain");
    assert.equal(seasonRewardFor(3, 6)?.tone, "gain");
    assert.equal(seasonRewardFor(4, 6)?.tone, "neutral");
    assert.equal(seasonRewardFor(5, 6)?.tone, "due");
    assert.equal(seasonRewardFor(6, 6)?.tone, "due");
  });

  it("ne renvoie rien pour une ligue qui n'a pas exactement 6 joueurs", () => {
    assert.equal(seasonRewardFor(1, 5), null);
    assert.equal(seasonRewardFor(1, 7), null);
    assert.equal(seasonRewardFor(1, 0), null);
  });

  it("ne renvoie rien pour une position hors 1-6", () => {
    assert.equal(seasonRewardFor(7, 6), null);
    assert.equal(seasonRewardFor(0, 6), null);
  });
});
