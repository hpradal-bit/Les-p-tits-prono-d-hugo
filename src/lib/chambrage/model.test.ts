import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstUnreadId,
  groupReactions,
  mergeMessages,
  myReaction,
  readBy,
  readState,
  unreadCount,
  type RawMessage,
  type RawReaction,
  type RawRead,
} from "./model.ts";

function msg(over: Partial<RawMessage> = {}): RawMessage {
  return {
    id: "m1",
    senderId: "u1",
    messageType: "text",
    body: "Salut",
    mediaUrl: null,
    replyToId: null,
    createdAt: "2026-09-20T18:00:00.000Z",
    updatedAt: "2026-09-20T18:00:00.000Z",
    deletedAt: null,
    ...over,
  };
}

test("groupReactions : regroupe par emoji, le plus populaire en premier", () => {
  const reactions: RawReaction[] = [
    { messageId: "m1", userId: "u1", emoji: "❤️" },
    { messageId: "m1", userId: "u2", emoji: "😂" },
    { messageId: "m1", userId: "u3", emoji: "😂" },
    { messageId: "m2", userId: "u4", emoji: "🔥" }, // un autre message : ignoré
  ];
  const groups = groupReactions(reactions, "m1", "u2");
  assert.deepEqual(
    groups.map((g) => [g.emoji, g.count, g.mine]),
    [["😂", 2, true], ["❤️", 1, false]],
  );
  assert.deepEqual(groups[0].userIds, ["u2", "u3"]);
});

test("groupReactions : aucune réaction sur ce message → liste vide", () => {
  assert.deepEqual(groupReactions([{ messageId: "autre", userId: "u1", emoji: "❤️" }], "m1", "u1"), []);
});

test("myReaction : retrouve la réaction du joueur, ou null", () => {
  const reactions: RawReaction[] = [
    { messageId: "m1", userId: "u1", emoji: "❤️" },
    { messageId: "m1", userId: "u2", emoji: "😂" },
  ];
  assert.equal(myReaction(reactions, "m1", "u1"), "❤️");
  assert.equal(myReaction(reactions, "m1", "u3"), null);
});

test("readState : personne d'autre n'a lu → sent", () => {
  const reads: RawRead[] = [];
  assert.equal(readState(msg(), reads, ["u1", "u2", "u3"]), "sent");
});

test("readState : un seul autre membre a lu → partially_read", () => {
  const reads: RawRead[] = [{ userId: "u2", lastReadAt: "2026-09-20T18:05:00.000Z" }];
  assert.equal(readState(msg(), reads, ["u1", "u2", "u3"]), "partially_read");
});

test("readState : tout le monde a lu → read", () => {
  const reads: RawRead[] = [
    { userId: "u2", lastReadAt: "2026-09-20T18:05:00.000Z" },
    { userId: "u3", lastReadAt: "2026-09-20T18:05:00.000Z" },
  ];
  assert.equal(readState(msg(), reads, ["u1", "u2", "u3"]), "read");
});

test("readState : une lecture antérieure à l'envoi ne compte pas", () => {
  const reads: RawRead[] = [
    { userId: "u2", lastReadAt: "2026-09-20T17:00:00.000Z" }, // avant le message
    { userId: "u3", lastReadAt: "2026-09-20T18:05:00.000Z" },
  ];
  assert.equal(readState(msg(), reads, ["u1", "u2", "u3"]), "partially_read");
});

test("readState : un groupe d'un seul (l'auteur) est toujours lu", () => {
  assert.equal(readState(msg(), [], ["u1"]), "read");
});

test("readBy : liste les lecteurs, jamais l'auteur", () => {
  const reads: RawRead[] = [
    { userId: "u2", lastReadAt: "2026-09-20T18:05:00.000Z" },
    { userId: "u1", lastReadAt: "2026-09-20T19:00:00.000Z" }, // l'auteur : jamais compté
  ];
  assert.deepEqual(readBy(msg(), reads, ["u1", "u2", "u3"]), ["u2"]);
});

test("unreadCount : compte les messages des autres depuis la dernière lecture", () => {
  const messages = [
    { senderId: "u1", createdAt: "2026-09-20T18:00:00.000Z" },
    { senderId: "u2", createdAt: "2026-09-20T18:05:00.000Z" },
    { senderId: "u3", createdAt: "2026-09-20T18:10:00.000Z" },
  ];
  assert.equal(unreadCount(messages, "u1", "2026-09-20T18:02:00.000Z"), 2);
  assert.equal(unreadCount(messages, "u1", null), 2, "jamais lu : tout ce qui n'est pas de soi compte");
});

test("unreadCount : mes propres messages ne comptent jamais", () => {
  const messages = [{ senderId: "u1", createdAt: "2026-09-20T18:00:00.000Z" }];
  assert.equal(unreadCount(messages, "u1", null), 0);
});

test("firstUnreadId : repère le premier message non lu d'un autre joueur", () => {
  const messages = [
    { id: "m1", senderId: "u1", createdAt: "2026-09-20T18:00:00.000Z" },
    { id: "m2", senderId: "u2", createdAt: "2026-09-20T18:05:00.000Z" },
    { id: "m3", senderId: "u3", createdAt: "2026-09-20T18:10:00.000Z" },
  ];
  assert.equal(firstUnreadId(messages, "u1", "2026-09-20T18:02:00.000Z"), "m2");
});

test("firstUnreadId : rien de neuf → null", () => {
  const messages = [{ id: "m1", senderId: "u2", createdAt: "2026-09-20T18:00:00.000Z" }];
  assert.equal(firstUnreadId(messages, "u1", "2026-09-20T19:00:00.000Z"), null);
});

test("mergeMessages : fusionne sans doublon et trie chronologiquement", () => {
  const existing = [msg({ id: "m1", createdAt: "2026-09-20T18:00:00.000Z" })];
  const incoming = [
    msg({ id: "m1", createdAt: "2026-09-20T18:00:00.000Z", body: "corrigé" }), // même id : remplace
    msg({ id: "m2", createdAt: "2026-09-20T17:59:00.000Z" }), // plus ancien
  ];
  const merged = mergeMessages(existing, incoming);
  assert.deepEqual(merged.map((m) => m.id), ["m2", "m1"]);
  assert.equal(merged[1].body, "corrigé");
});
