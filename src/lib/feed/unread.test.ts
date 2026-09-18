import { test } from "node:test";
import assert from "node:assert/strict";
import { hasUnread, type UnreadCandidate } from "./unread.ts";

const MOI = "moi";
const post = (authorId: string | null, createdAt: string): UnreadCandidate => ({
  authorId,
  createdAt,
});

test("un message d'un autre, posté après ma dernière lecture, allume la pastille", () => {
  assert.equal(
    hasUnread([post("pierre", "2026-09-18T12:00:00Z")], MOI, "2026-09-18T10:00:00Z"),
    true,
  );
});

test("un message déjà lu ne l'allume pas", () => {
  assert.equal(
    hasUnread([post("pierre", "2026-09-18T09:00:00Z")], MOI, "2026-09-18T10:00:00Z"),
    false,
  );
});

test("mes propres messages ne me préviennent jamais", () => {
  assert.equal(hasUnread([post(MOI, "2026-09-18T12:00:00Z")], MOI, "2026-09-18T10:00:00Z"), false);
});

test("les publications automatiques du jeu ne comptent pas", () => {
  assert.equal(hasUnread([post(null, "2026-09-18T12:00:00Z")], MOI, "2026-09-18T10:00:00Z"), false);
});

test("jamais ouvert le fil : tout mot d'un autre compte", () => {
  assert.equal(hasUnread([post("pierre", "2020-01-01T00:00:00Z")], MOI, null), true);
});

test("jamais ouvert, mais seulement mes propres mots : rien à signaler", () => {
  assert.equal(hasUnread([post(MOI, "2026-09-18T12:00:00Z")], MOI, null), false);
});

test("un fil vide n'allume rien", () => {
  assert.equal(hasUnread([], MOI, null), false);
});

test("un seul message non lu dans le tas suffit", () => {
  const posts = [
    post(MOI, "2026-09-18T13:00:00Z"),
    post(null, "2026-09-18T12:30:00Z"),
    post("marc", "2026-09-18T11:00:00Z"),
    post("pierre", "2026-09-18T09:00:00Z"),
  ];
  assert.equal(hasUnread(posts, MOI, "2026-09-18T10:00:00Z"), true);
});

test("une date de lecture illisible ne masque pas les messages", () => {
  assert.equal(hasUnread([post("pierre", "2026-09-18T12:00:00Z")], MOI, "jamais"), true);
});
