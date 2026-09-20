import type { MentionSegment, ReactionGroup, ReadState, RawMessage } from "@/lib/chambrage/model";
import type { PlayerRef } from "@/lib/standings/engine";

/** Le message vu par l'écran : brut + tout ce qui s'en déduit pour l'afficher. */
export interface MessageVM {
  message: RawMessage;
  sender: PlayerRef | null;
  isMine: boolean;
  replyTo: { id: string; senderName: string; preview: string } | null;
  reactions: ReactionGroup[];
  myReactionEmoji: string | null;
  readState: ReadState;
  readByNames: string[];
  notReadByNames: string[];
  /** Le corps du message, découpé pour surligner les `@Untel` reconnus. */
  mentionSegments: MentionSegment[];
  /** Un `@` de ce message désigne-t-il le joueur connecté ? */
  mentionsMe: boolean;
  /** Envoi optimiste : encore en vol, ou en échec — `undefined` une fois confirmé. */
  pending?: "sending" | "error";
}
