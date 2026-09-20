/**
 * Le cœur pur de Chambrage : regroupement des réactions, statut lu/non lu,
 * repère du premier message non lu. Aucun accès base ici — c'est ce qui rend
 * ces règles testables sans réseau, et rejouables à l'identique.
 */

export type MessageType = "text" | "image";

export interface RawMessage {
  id: string;
  senderId: string | null;
  messageType: MessageType;
  body: string | null;
  mediaUrl: string | null;
  replyToId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface RawReaction {
  messageId: string;
  userId: string;
  emoji: string;
}

export interface RawRead {
  userId: string;
  lastReadAt: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  /** Le joueur connecté a-t-il posé CETTE réaction ? */
  mine: boolean;
}

/**
 * Les réactions d'un message, groupées par emoji — combien, qui, et si
 * « moi » en fait partie. Une seule réaction par personne (§2.8), donc
 * chaque userId n'apparaît que dans un seul groupe.
 *
 * Tri : le plus populaire en premier, comme les messageries usuelles ; à
 * effectif égal, l'ordre d'apparition (premier arrivé) plutôt qu'un ordre
 * alphabétique d'emoji qui n'aurait aucun sens pour un joueur.
 */
export function groupReactions(
  reactions: readonly RawReaction[],
  messageId: string,
  viewerId: string,
): ReactionGroup[] {
  const order: string[] = [];
  const byEmoji = new Map<string, { userIds: string[] }>();

  for (const r of reactions) {
    if (r.messageId !== messageId) continue;
    let group = byEmoji.get(r.emoji);
    if (!group) {
      group = { userIds: [] };
      byEmoji.set(r.emoji, group);
      order.push(r.emoji);
    }
    group.userIds.push(r.userId);
  }

  return order
    .map((emoji) => {
      const userIds = byEmoji.get(emoji)!.userIds;
      return { emoji, count: userIds.length, userIds, mine: userIds.includes(viewerId) };
    })
    .sort((a, b) => b.count - a.count);
}

/** La réaction que CE joueur a posée sur ce message, s'il y en a une. */
export function myReaction(
  reactions: readonly RawReaction[],
  messageId: string,
  viewerId: string,
): string | null {
  return reactions.find((r) => r.messageId === messageId && r.userId === viewerId)?.emoji ?? null;
}

export type ReadState = "sent" | "partially_read" | "read";

/**
 * ✓ envoyé, ✓✓ gris (certains l'ont lu), ✓✓ bleu (tout le monde l'a lu) —
 * calculé à partir de `message_reads`, jamais deviné à l'affichage. Un
 * membre qui a quitté la ligue ou dont le compte est parti n'entre plus dans
 * `memberIds` : il ne bloque donc jamais indéfiniment un message à
 * « partiellement lu ».
 */
export function readState(
  message: Pick<RawMessage, "senderId" | "createdAt">,
  reads: readonly RawRead[],
  memberIds: readonly string[],
): ReadState {
  const others = memberIds.filter((id) => id !== message.senderId);
  if (others.length === 0) return "read";

  const sentAt = new Date(message.createdAt).getTime();
  const readByOthers = others.filter((id) => {
    const row = reads.find((r) => r.userId === id);
    if (!row) return false;
    return new Date(row.lastReadAt).getTime() >= sentAt;
  });

  if (readByOthers.length === 0) return "sent";
  if (readByOthers.length === others.length) return "read";
  return "partially_read";
}

/** Qui, precisément, a lu ce message — pour un détail « lu par Untel, Untel ». */
export function readBy(
  message: Pick<RawMessage, "senderId" | "createdAt">,
  reads: readonly RawRead[],
  memberIds: readonly string[],
): string[] {
  const sentAt = new Date(message.createdAt).getTime();
  return memberIds.filter((id) => {
    if (id === message.senderId) return false;
    const row = reads.find((r) => r.userId === id);
    return row !== undefined && new Date(row.lastReadAt).getTime() >= sentAt;
  });
}

/**
 * Combien de messages d'AUTRES joueurs sont arrivés depuis la dernière
 * lecture — le badge « 🔴 3 » sur l'onglet Chambrage. Ses propres messages
 * ne comptent jamais : les écrire ne crée pas une dette de lecture envers
 * soi-même.
 */
export function unreadCount(
  messages: readonly Pick<RawMessage, "senderId" | "createdAt">[],
  viewerId: string,
  lastReadAt: string | null,
): number {
  const since = lastReadAt ? new Date(lastReadAt).getTime() : null;
  return messages.filter((m) => {
    if (m.senderId === viewerId) return false;
    if (since === null) return true;
    return new Date(m.createdAt).getTime() > since;
  }).length;
}

/**
 * L'identifiant du premier message non lu, dans une liste triée du plus
 * ancien au plus récent — c'est là que le scroll intelligent (§2.15) pose le
 * séparateur « ↓ N nouveaux messages » à l'ouverture de la conversation.
 * `null` s'il n'y a rien de nouveau (tout est déjà lu, ou aucun historique).
 */
export function firstUnreadId(
  messages: readonly Pick<RawMessage, "id" | "senderId" | "createdAt">[],
  viewerId: string,
  lastReadAt: string | null,
): string | null {
  const since = lastReadAt ? new Date(lastReadAt).getTime() : null;
  for (const m of messages) {
    if (m.senderId === viewerId) continue;
    if (since !== null && new Date(m.createdAt).getTime() <= since) continue;
    return m.id;
  }
  return null;
}

/**
 * Fusionne un lot de messages fraîchement arrivés (temps réel, ou une page
 * d'historique) dans la liste déjà connue, sans jamais dupliquer — un même
 * message peut arriver deux fois (l'écho temps réel de son propre envoi
 * optimiste, ou un retry réseau après une coupure). Trie du plus ancien au
 * plus récent, ordre naturel de lecture d'une conversation.
 */
export function mergeMessages(
  existing: readonly RawMessage[],
  incoming: readonly RawMessage[],
): RawMessage[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => {
    const t = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });
}
