import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daySeparatorLabel,
  firstUnreadId,
  groupReactions,
  mergeMessages,
  myReaction,
  notReadBy,
  parseMentions,
  readBy,
  readState,
  sameBurst,
  splitMentions,
  tallyPoll,
  unreadCount,
  type RawMessage,
  type RawPollOption,
  type RawPollVote,
  type RawReaction,
  type RawRead,
} from "./model.ts";

const ROSTER = [
  { userId: "u-marc", displayName: "Marc" },
  { userId: "u-marco", displayName: "Marco" },
  { userId: "u-fanta", displayName: "Fanta" },
];

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
    pollAllowsMultiple: null,
    audioDurationSeconds: null,
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

test("notReadBy : liste ceux qui n'ont pas encore lu, jamais l'auteur", () => {
  const reads: RawRead[] = [{ userId: "u2", lastReadAt: "2026-09-20T18:05:00.000Z" }];
  assert.deepEqual(notReadBy(msg(), reads, ["u1", "u2", "u3"]), ["u3"]);
});

test("notReadBy : une lecture antérieure à l'envoi compte comme non lu", () => {
  const reads: RawRead[] = [{ userId: "u2", lastReadAt: "2026-09-20T17:00:00.000Z" }];
  assert.deepEqual(notReadBy(msg(), reads, ["u1", "u2", "u3"]), ["u2", "u3"]);
});

test("notReadBy et readBy sont complémentaires sur les autres membres", () => {
  const reads: RawRead[] = [{ userId: "u2", lastReadAt: "2026-09-20T18:05:00.000Z" }];
  const members = ["u1", "u2", "u3", "u4"];
  const read = readBy(msg(), reads, members);
  const notRead = notReadBy(msg(), reads, members);
  assert.deepEqual([...read, ...notRead].sort(), ["u2", "u3", "u4"]);
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

test("parseMentions : repère un @Untel parmi les membres de la ligue", () => {
  assert.deepEqual(parseMentions("Salut @Fanta, ça va ?", ROSTER), ["u-fanta"]);
});

test("parseMentions : la correspondance la plus longue l'emporte (Marco, pas Marc)", () => {
  assert.deepEqual(parseMentions("@Marco tu es là ?", ROSTER), ["u-marco"]);
});

test("parseMentions : s'arrête à une frontière de mot (Marcolivier n'est ni Marc ni Marco)", () => {
  assert.deepEqual(parseMentions("@Marcolivier n'existe pas", ROSTER), []);
});

test("parseMentions : plusieurs mentions distinctes, jamais de doublon", () => {
  assert.deepEqual(
    new Set(parseMentions("@Marc et @Fanta, et encore @Marc", ROSTER)),
    new Set(["u-marc", "u-fanta"]),
  );
});

test("parseMentions : aucun @ dans le texte → rien", () => {
  assert.deepEqual(parseMentions("Salut tout le monde", ROSTER), []);
});

test("splitMentions : découpe le texte autour de la mention reconnue", () => {
  assert.deepEqual(splitMentions("Salut @Fanta, ça va ?", ROSTER), [
    { text: "Salut ", mentionUserId: null },
    { text: "@Fanta", mentionUserId: "u-fanta" },
    { text: ", ça va ?", mentionUserId: null },
  ]);
});

test("splitMentions : un texte sans mention reconnue reste un seul segment", () => {
  assert.deepEqual(splitMentions("Rien à signaler", ROSTER), [
    { text: "Rien à signaler", mentionUserId: null },
  ]);
});

const POLL_OPTIONS: RawPollOption[] = [
  { id: "o1", messageId: "poll1", position: 0, label: "Toulouse" },
  { id: "o2", messageId: "poll1", position: 1, label: "Bordeaux" },
];

test("tallyPoll : compte les voix par option, et marque les miennes", () => {
  const votes: RawPollVote[] = [
    { optionId: "o1", userId: "u1" },
    { optionId: "o1", userId: "u2" },
    { optionId: "o2", userId: "u3" },
  ];
  const tally = tallyPoll(POLL_OPTIONS, votes, "u1");
  assert.deepEqual(
    tally.map((t) => [t.option.id, t.count, t.mine, t.percent]),
    [
      ["o1", 2, true, 67],
      ["o2", 1, false, 33],
    ],
  );
});

test("tallyPoll : personne n'a encore voté → 0 partout, jamais une division par zéro", () => {
  const tally = tallyPoll(POLL_OPTIONS, [], "u1");
  assert.deepEqual(tally.map((t) => [t.count, t.percent, t.mine]), [
    [0, 0, false],
    [0, 0, false],
  ]);
});

test("tallyPoll : respecte l'ordre des options (position), pas l'ordre des votes", () => {
  const votes: RawPollVote[] = [{ optionId: "o2", userId: "u1" }];
  const tally = tallyPoll([POLL_OPTIONS[1], POLL_OPTIONS[0]], votes, "u1");
  assert.deepEqual(tally.map((t) => t.option.id), ["o1", "o2"]);
});

test("sameBurst : même expéditeur, moins de 5 min d'écart → même rafale", () => {
  const a = { senderId: "u1", createdAt: "2026-09-20T18:00:00.000Z" };
  const b = { senderId: "u1", createdAt: "2026-09-20T18:03:00.000Z" };
  assert.equal(sameBurst(a, b), true);
});

test("sameBurst : expéditeurs différents → jamais la même rafale", () => {
  const a = { senderId: "u1", createdAt: "2026-09-20T18:00:00.000Z" };
  const b = { senderId: "u2", createdAt: "2026-09-20T18:00:30.000Z" };
  assert.equal(sameBurst(a, b), false);
});

test("sameBurst : même expéditeur mais trop d'écart → rafales séparées", () => {
  const a = { senderId: "u1", createdAt: "2026-09-20T18:00:00.000Z" };
  const b = { senderId: "u1", createdAt: "2026-09-20T18:06:00.000Z" };
  assert.equal(sameBurst(a, b), false);
});

test("sameBurst : un message d'auteur inconnu (compte supprimé) n'est jamais regroupé", () => {
  const a = { senderId: null, createdAt: "2026-09-20T18:00:00.000Z" };
  const b = { senderId: null, createdAt: "2026-09-20T18:00:10.000Z" };
  assert.equal(sameBurst(a, b), false);
});

test("daySeparatorLabel : aujourd'hui, hier, une date plus ancienne", () => {
  const now = new Date("2026-09-20T20:00:00.000Z");
  assert.equal(daySeparatorLabel("2026-09-20T08:00:00.000Z", now), "Aujourd'hui");
  assert.equal(daySeparatorLabel("2026-09-19T23:59:00.000Z", now), "Hier");
  assert.equal(daySeparatorLabel("2026-09-05T12:00:00.000Z", now), "samedi 5 septembre");
});

test("daySeparatorLabel : une année différente porte le millésime", () => {
  const now = new Date("2026-09-20T20:00:00.000Z");
  assert.equal(daySeparatorLabel("2025-12-31T12:00:00.000Z", now), "mercredi 31 décembre 2025");
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
