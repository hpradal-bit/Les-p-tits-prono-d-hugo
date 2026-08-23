import type { ActionState } from "@/lib/auth/action-state";

/* ---------------------------------------------------------------------------
   Vocabulaire de l'espace admin.

   Les codes d'action sont en anglais — ils vivent en base, dans
   `admin_actions.action`. Les libellés sont en français : le journal est lu par
   les joueurs, pas seulement par l'administrateur.
   --------------------------------------------------------------------------- */

export const ADMIN_ACTIONS = {
  "round.locked": "Journée verrouillée",
  "round.reopened": "Journée rouverte",
  "round.settled": "Journée clôturée",
  "round.recomputed": "Points recalculés",

  "fixture.result_recorded": "Résultat saisi à la main",
  "fixture.kickoff_changed": "Horaire modifié",
  "fixture.status_forced": "Statut forcé",

  "ruleset.version_created": "Nouvelle version du barème",
  "ruleset.points_changed": "Barème de points modifié",
  "ruleset.lock_changed": "Délai de verrouillage modifié",
  "ruleset.exact_score_changed": "Quota de scores exacts modifié",
  "ruleset.margin_bucket_changed": "Tranche d'écart modifiée",
  "settings.updated": "Réglage modifié",
  "group.invite_code_changed": "Code d'invitation modifié",

  "player.created": "Joueur ajouté",
  "player.deactivated": "Joueur désactivé",
  "player.reactivated": "Joueur réactivé",
  "player.avatar_changed": "Avatar corrigé",
  "player.role_changed": "Rôle modifié",
  "player.password_reset": "Réinitialisation du mot de passe",

  "points.adjusted": "Ajustement de points",
  "points.adjustment_reverted": "Ajustement annulé",
} as const;

export type AdminActionCode = keyof typeof ADMIN_ACTIONS;

export function actionLabel(code: string): string {
  return (ADMIN_ACTIONS as Record<string, string>)[code] ?? code;
}

export type AdminEntity =
  | "round"
  | "fixture"
  | "scoring_ruleset"
  | "app_setting"
  | "group"
  | "profile"
  | "margin_bucket"
  | "point_adjustment";

export const ENTITY_LABELS: Record<AdminEntity, string> = {
  round: "Journée",
  fixture: "Match",
  scoring_ruleset: "Barème",
  app_setting: "Réglage",
  group: "Groupe",
  profile: "Joueur",
  margin_bucket: "Tranche d'écart",
  point_adjustment: "Ajustement",
};

/** Libellés français des champs affichés dans l'avant/après du journal. */
export const FIELD_LABELS: Record<string, string> = {
  home_score: "Score domicile",
  away_score: "Score extérieur",
  score: "Score",
  status: "Statut",
  kickoff_at: "Coup d'envoi",
  kickoff_confirmed: "Horaire confirmé",
  locks_at: "Verrouillage",
  data_source: "Source",
  locked_at: "Verrouillé le",
  settled_at: "Clôturé le",
  is_active: "Actif",
  role: "Rôle",
  avatar_kind: "Type d'avatar",
  avatar_value: "Avatar",
  display_name: "Pseudo",
  first_name: "Prénom",
  email: "E-mail",
  invite_code: "Code d'invitation",
  version: "Version",
  label: "Intitulé",
  points: "Points",
  margin_mode: "Mode d'écart",
  margin_distance_tolerance: "Tolérance",
  exact_score: "Score exact",
  lock: "Verrouillage",
  default_prediction: "Prono par défaut",
  buckets: "Tranches d'écart",
  delta: "Points",
  reason: "Raison",
  reverts: "Annule",
  fixtures_scored: "Matchs comptés",
  predictions_scored: "Pronostics notés",
  predictions_changed: "Pronostics modifiés",
  ruleset_version: "Version du barème",
  locks_recomputed: "Verrouillages recalculés",
  fixtures_retimed: "Matchs reprogrammés",
  minutes_before_kickoff: "Minutes avant le coup d'envoi",
  quota: "Quota",
  period: "Période",
  min_points: "Écart minimum",
  max_points: "Écart maximum",
  wrong: "Mauvais vainqueur",
  winner: "Bon vainqueur",
  winner_and_margin: "Vainqueur + tranche",
  players: "Joueurs",
  round: "Journée",
  fixture: "Match",
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export const ROUND_STATUS_LABELS: Record<string, string> = {
  upcoming: "À venir",
  open: "Ouverte",
  locked: "Verrouillée",
  settled: "Clôturée",
};

/* ---------------------------------------------------------------------------
   Résultat d'une action d'administration.

   On reprend l'`ActionState` du chantier A — c'est lui que consomment `Alert`
   et `useActionState` — en y ajoutant deux choses propres à l'admin : le détail
   des conséquences (« 4 pronostics recalculés ») et un lien à usage unique
   (invitation, réinitialisation de mot de passe), affiché une seule fois.
   --------------------------------------------------------------------------- */

/**
 * Le contexte du visiteur, tel que le serveur le voit.
 *
 * `isAdmin` est lu en base à chaque appel, jamais dans le jeton du navigateur :
 * c'est ce qui empêche un joueur de se promouvoir en bricolant son stockage
 * local.
 */
export interface AdminContext {
  userId: string;
  groupId: string;
  displayName: string;
  isAdmin: boolean;
}

export interface AdminActionState extends ActionState {
  details?: string[];
  link?: string;
}

export const ADMIN_IDLE: AdminActionState = { status: "idle" };

export function adminOk(
  message: string,
  extra: { details?: string[]; link?: string } = {},
): AdminActionState {
  return { status: "success", message, ...extra };
}

export function adminFail(
  message: string,
  extra: { details?: string[]; fieldErrors?: Record<string, string[]> } = {},
): AdminActionState {
  return { status: "error", message, ...extra };
}
