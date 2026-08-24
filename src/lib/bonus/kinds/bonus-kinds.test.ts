import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { yesNo } from "./yes-no.ts";
import { singleChoice } from "./single-choice.ts";
import { numericClosest } from "./numeric-closest.ts";
import { podium } from "./podium.ts";

describe("yes_no", () => {
  test("bonne reponse → points", () => {
    const grades = yesNo.grade({
      config: {},
      scoring: { correct: 3 },
      correctAnswer: { value: "yes" },
      entries: [
        { userId: "u1", answer: { value: "yes" } },
        { userId: "u2", answer: { value: "no" } },
      ],
    });
    assert.equal(grades.length, 2);
    const u1 = grades.find((g) => g.userId === "u1")!;
    const u2 = grades.find((g) => g.userId === "u2")!;
    assert.equal(u1.points, 3);
    assert.equal(u1.breakdown.outcome, "correct");
    assert.equal(u2.points, 0);
    assert.equal(u2.breakdown.outcome, "wrong");
  });
});

describe("single_choice", () => {
  const config = {
    options: [
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B" },
      { value: "c", label: "Option C" },
    ],
  };

  test("bonne reponse → points", () => {
    const grades = singleChoice.grade({
      config,
      scoring: { correct: 5 },
      correctAnswer: { value: "b" },
      entries: [
        { userId: "u1", answer: { value: "b" } },
        { userId: "u2", answer: { value: "a" } },
        { userId: "u3", answer: { value: "c" } },
      ],
    });
    assert.equal(grades.find((g) => g.userId === "u1")!.points, 5);
    assert.equal(grades.find((g) => g.userId === "u2")!.points, 0);
    assert.equal(grades.find((g) => g.userId === "u3")!.points, 0);
  });

  test("formatAnswer donne le label", () => {
    assert.equal(singleChoice.formatAnswer({ value: "b" }, config), "Option B");
  });
});

describe("numeric_closest", () => {
  test("exact → points max, plus proche → points reduits", () => {
    const grades = numericClosest.grade({
      config: { min: 0, max: 100 },
      scoring: { exact: 5, closest: 3 },
      correctAnswer: { value: 42 },
      entries: [
        { userId: "u1", answer: { value: 42 } },
        { userId: "u2", answer: { value: 40 } },
        { userId: "u3", answer: { value: 10 } },
      ],
    });
    const u1 = grades.find((g) => g.userId === "u1")!;
    const u2 = grades.find((g) => g.userId === "u2")!;
    const u3 = grades.find((g) => g.userId === "u3")!;
    assert.equal(u1.points, 5);
    assert.equal(u1.breakdown.outcome, "correct");
    assert.equal(u2.points, 3);
    assert.equal(u2.breakdown.outcome, "partial");
    assert.equal(u3.points, 0);
    assert.equal(u3.breakdown.outcome, "wrong");
  });

  test("deux joueurs a egalite → les deux plus proches", () => {
    const grades = numericClosest.grade({
      config: {},
      scoring: { exact: 5, closest: 3 },
      correctAnswer: { value: 50 },
      entries: [
        { userId: "u1", answer: { value: 48 } },
        { userId: "u2", answer: { value: 52 } },
        { userId: "u3", answer: { value: 30 } },
      ],
    });
    const u1 = grades.find((g) => g.userId === "u1")!;
    const u2 = grades.find((g) => g.userId === "u2")!;
    assert.equal(u1.points, 3);
    assert.equal(u2.points, 3);
  });

  test("aucune reponse → tableau vide", () => {
    const grades = numericClosest.grade({
      config: {},
      scoring: { exact: 5, closest: 3 },
      correctAnswer: { value: 50 },
      entries: [],
    });
    assert.equal(grades.length, 0);
  });
});

describe("podium", () => {
  const config = {
    options: [
      { value: "tou", label: "Toulouse" },
      { value: "bor", label: "Bordeaux" },
      { value: "rac", label: "Racing" },
      { value: "cle", label: "Clermont" },
      { value: "lr", label: "La Rochelle" },
    ],
    count: 3,
  };
  const scoring = { exact_position: 5, in_podium: 2 };

  test("3 bonnes positions → 15 points", () => {
    const grades = podium.grade({
      config,
      scoring,
      correctAnswer: { picks: ["tou", "bor", "rac"] },
      entries: [{ userId: "u1", answer: { picks: ["tou", "bor", "rac"] } }],
    });
    assert.equal(grades[0].points, 15);
    assert.equal(grades[0].breakdown.outcome, "correct");
  });

  test("2 bonnes equipes mais 1 mal placee → 5+5+2 = 12", () => {
    const grades = podium.grade({
      config,
      scoring,
      correctAnswer: { picks: ["tou", "bor", "rac"] },
      entries: [{ userId: "u1", answer: { picks: ["tou", "rac", "bor"] } }],
    });
    assert.equal(grades[0].points, 5 + 2 + 2);
    assert.equal(grades[0].breakdown.outcome, "partial");
  });

  test("aucune bonne equipe → 0 point", () => {
    const grades = podium.grade({
      config,
      scoring,
      correctAnswer: { picks: ["tou", "bor", "rac"] },
      entries: [{ userId: "u1", answer: { picks: ["cle", "lr", "cle"] } }],
    });
    assert.equal(grades[0].points, 0);
    assert.equal(grades[0].breakdown.outcome, "wrong");
  });

  test("1 equipe dans le podium mais mal placee → 2 points", () => {
    const grades = podium.grade({
      config,
      scoring,
      correctAnswer: { picks: ["tou", "bor", "rac"] },
      entries: [{ userId: "u1", answer: { picks: ["cle", "lr", "tou"] } }],
    });
    assert.equal(grades[0].points, 2);
  });

  test("formatAnswer affiche les labels", () => {
    const result = podium.formatAnswer(
      { picks: ["tou", "bor", "rac"] },
      config,
    );
    assert.ok(result.includes("Toulouse"));
    assert.ok(result.includes("Bordeaux"));
  });
});
