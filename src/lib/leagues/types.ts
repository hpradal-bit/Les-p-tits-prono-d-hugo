export type { Uuid } from "../types.ts";
import type { Uuid } from "../types.ts";

export type LeagueRole = "player" | "admin";

/** Une ligue privée : membres, classement et administration lui sont propres. */
export interface League {
  id: Uuid;
  competitionId: Uuid;
  competitionCode: string;
  competitionName: string;
  name: string;
  logoUrl: string | null;
  slogan: string | null;
  joinKey: string;
  createdBy: Uuid | null;
  createdAt: string;
}

/** Une ligue telle qu'un joueur la retrouve dans « Mes ligues ». */
export interface LeagueMembership {
  leagueId: Uuid;
  leagueName: string;
  competitionCode: string;
  competitionName: string;
  role: LeagueRole;
  joinedAt: string;
}

export interface LeagueMemberRow {
  userId: Uuid;
  displayName: string;
  firstName: string;
  avatarKind: "emoji" | "photo" | "club";
  avatarValue: string;
  role: LeagueRole;
  joinedAt: string;
}
