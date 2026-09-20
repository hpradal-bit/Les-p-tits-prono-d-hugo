/**
 * Le cœur pur de Chambrage : regroupement des réactions, statut lu/non lu,
 * repère du premier message non lu. Aucun accès base ici — c'est ce qui rend
 * ces règles testables sans réseau, et rejouables à l'identique.
 */

export type MessageType = "text" | "image" | "poll";

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
  /** Non nul seulement pour un sondage (`messageType === "poll"`). */
  pollAllowsMultiple: boolean | null;
}

export interface RawPollOption {
  id: string;
  messageId: string;
  position: number;
  label: string;
}

export interface RawPollVote {
  optionId: string;
  userId: string;
}

export interface PollOptionTally {
  option: RawPollOption;
  count: number;
  /** Ai-je voté pour cette option ? */
  mine: boolean;
  /** Part de l'ensemble des votes de ce sondage, 0 à 100 — 0 si personne n'a encore voté. */
  percent: number;
}

/**
 * Le dépouillement d'un sondage : combien de voix par option, et pour
 * lesquelles le joueur connecté a lui-même voté. Le pourcentage se calcule
 * sur le total de VOIX (pas de votants) : un sondage à réponses multiples où
 * chacun coche deux cases n'a donc pas des pourcentages qui totalisent 100 —
 * c'est le comportement WhatsApp, pas un bug d'arrondi.
 */
export function tallyPoll(
  options: readonly RawPollOption[],
  votes: readonly RawPollVote[],
  viewerId: string,
): PollOptionTally[] {
  const total = votes.length;
  return [...options]
    .sort((a, b) => a.position - b.position)
    .map((option) => {
      const forOption = votes.filter((v) => v.optionId === option.id);
      return {
        option,
        count: forOption.length,
        mine: forOption.some((v) => v.userId === viewerId),
        percent: total === 0 ? 0 : Math.round((forOption.length / total) * 100),
      };
    });
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
 * Le complément exact de `readBy` — qui n'a PAS encore lu. Jamais déduit en
 * comparant juste à `readState` (« pas read ») : un groupe encore
 * `partially_read` a des lecteurs ET des non-lecteurs, il faut les deux
 * listes à la fois pour l'écran « qui a lu / qui n'a pas lu ».
 */
export function notReadBy(
  message: Pick<RawMessage, "senderId" | "createdAt">,
  reads: readonly RawRead[],
  memberIds: readonly string[],
): string[] {
  const sentAt = new Date(message.createdAt).getTime();
  return memberIds.filter((id) => {
    if (id === message.senderId) return false;
    const row = reads.find((r) => r.userId === id);
    return row === undefined || new Date(row.lastReadAt).getTime() < sentAt;
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

export interface MentionCandidate {
  userId: string;
  displayName: string;
}

/**
 * Repère les `@Untel` d'un message parmi les membres de la ligue, pour
 * notifier précisément la bonne personne — jamais deviné à l'affichage, la
 * même règle sert à notifier et à surligner.
 *
 * Aucune colonne dédiée : le nom affiché tel qu'écrit dans le corps du
 * message fait foi, comparé insensible à la casse. La correspondance la
 * plus longue l'emporte (« Marco » ne doit jamais se lire comme « Marc »
 * suivi de « o »), et doit s'arrêter sur une frontière de mot.
 */
export function parseMentions(body: string, roster: readonly MentionCandidate[]): string[] {
  const found = new Set<string>();
  const candidates = [...roster]
    .filter((c) => c.displayName.trim() !== "")
    .sort((a, b) => b.displayName.length - a.displayName.length);
  const lower = body.toLowerCase();

  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== "@") continue;
    const rest = lower.slice(i + 1);
    const match = candidates.find((c) => rest.startsWith(c.displayName.toLowerCase()));
    if (!match) continue;
    const end = i + 1 + match.displayName.length;
    const boundary = body[end];
    if (boundary && /[\p{L}\p{N}]/u.test(boundary)) continue;
    found.add(match.userId);
  }

  return [...found];
}

export interface MentionSegment {
  text: string;
  /** L'identifiant du joueur mentionné dans ce segment, ou `null` pour du texte ordinaire. */
  mentionUserId: string | null;
}

/**
 * Le même repérage que `parseMentions`, mais découpé en segments pour
 * l'affichage — chaque `@Untel` reconnu devient son propre segment, mis en
 * évidence par l'écran.
 */
export function splitMentions(body: string, roster: readonly MentionCandidate[]): MentionSegment[] {
  const candidates = [...roster]
    .filter((c) => c.displayName.trim() !== "")
    .sort((a, b) => b.displayName.length - a.displayName.length);
  const lower = body.toLowerCase();

  const segments: MentionSegment[] = [];
  let plainStart = 0;
  let i = 0;
  while (i < body.length) {
    if (body[i] === "@") {
      const rest = lower.slice(i + 1);
      const match = candidates.find((c) => rest.startsWith(c.displayName.toLowerCase()));
      if (match) {
        const end = i + 1 + match.displayName.length;
        const boundary = body[end];
        if (!boundary || !/[\p{L}\p{N}]/u.test(boundary)) {
          if (i > plainStart) segments.push({ text: body.slice(plainStart, i), mentionUserId: null });
          segments.push({ text: body.slice(i, end), mentionUserId: match.userId });
          i = end;
          plainStart = end;
          continue;
        }
      }
    }
    i += 1;
  }
  if (plainStart < body.length) segments.push({ text: body.slice(plainStart), mentionUserId: null });
  return segments;
}

/**
 * Deux messages consécutifs appartiennent-ils à la même « rafale » — même
 * expéditeur, moins de `maxGapMinutes` d'écart ? Sert à n'afficher l'avatar
 * et le nom qu'une fois par rafale, comme WhatsApp/Messenger, plutôt qu'à
 * chaque message.
 */
export function sameBurst(
  a: Pick<RawMessage, "senderId" | "createdAt">,
  b: Pick<RawMessage, "senderId" | "createdAt">,
  maxGapMinutes = 5,
): boolean {
  if (a.senderId === null || b.senderId === null) return false;
  if (a.senderId !== b.senderId) return false;
  const gap = Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return gap <= maxGapMinutes * 60_000;
}

/**
 * L'étiquette du séparateur de journée au-dessus du premier message d'un
 * jour civil donné — « Aujourd'hui », « Hier », ou une date complète.
 * Toujours appelée côté navigateur (le fuseau du joueur, pas celui du
 * serveur) : c'est pourquoi elle prend `now` en paramètre plutôt que de
 * l'appeler elle-même, pour rester testable.
 */
export function daySeparatorLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("fr-FR", { month: "long" });
  return d.getFullYear() === now.getFullYear()
    ? `${weekday} ${day} ${month}`
    : `${weekday} ${day} ${month} ${d.getFullYear()}`;
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
