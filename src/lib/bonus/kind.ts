/**
 * Le contrat d'un type de question bonus.
 *
 * Chaque type est un module autonome qui expose quatre choses :
 *
 *   1. un formulaire de saisie   → `answerFields()` / `correctFields()`
 *   2. un validateur Zod         → `configSchema`, `scoringSchema`,
 *                                  `answerSchema()`, `correctSchema()`
 *   3. un correcteur             → `grade()`, fonction pure
 *   4. un afficheur de résultat  → `formatAnswer()`, `formatCorrect()`,
 *                                  `describeScoring()`
 *
 * Ajouter un type = écrire un module dans `kinds/` et l'inscrire dans
 * `registry.ts`. Rien d'autre ne bouge : ni les écrans, ni la correction, ni
 * le classement.
 *
 * Le formulaire est **déclaratif** (une liste de champs) et non un composant
 * React : un même rendu serveur sait donc dessiner tous les types, et le
 * correcteur reste une fonction pure, testable sans navigateur.
 *
 * Les clés des JSON `config` et `scoring` sont en snake_case : ce sont des
 * documents saisis par l'admin et stockés tels quels en base.
 */

import type { ZodType } from "zod";
import type { BonusBreakdown, BonusOutcome, GradedAnswer } from "./types.ts";
import type { Uuid } from "@/lib/types";

/* -------------------------------------------------------------------------
   Le formulaire de saisie, décrit et non dessiné
   ------------------------------------------------------------------------- */

export interface FieldBase {
  /** Nom du champ dans le formulaire HTML. */
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
}

export type InputField =
  | (FieldBase & {
      widget: "choice";
      options: { value: string; label: string }[];
    })
  | (FieldBase & {
      widget: "boolean";
      trueLabel: string;
      falseLabel: string;
    })
  | (FieldBase & {
      widget: "number";
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    });

/* -------------------------------------------------------------------------
   La correction
   ------------------------------------------------------------------------- */

export interface AnswerEntry<A> {
  userId: Uuid;
  answer: A;
}

export interface GradeInput<C, S, A, R> {
  config: C;
  scoring: S;
  correctAnswer: R;
  /**
   * Toutes les réponses de la question. Les types « le plus proche gagne »
   * ont besoin de l'ensemble : on ne corrige pas une réponse isolément.
   */
  entries: AnswerEntry<A>[];
}

/* -------------------------------------------------------------------------
   Le module d'un type
   ------------------------------------------------------------------------- */

export interface QuestionKindDefinition<C, S, A, R> {
  kind: string;
  /** Libellé affiché à l'admin. */
  label: string;
  /** Une phrase qui explique quand utiliser ce type. */
  help: string;

  configSchema: ZodType<C>;
  scoringSchema: ZodType<S>;
  /** Configuration proposée à la création d'une question de ce type. */
  configExample: C;
  /** Barème de repli, si `app_settings` n'en propose pas. */
  scoringExample: S;
  /** Aide à la saisie du JSON de configuration, en français. */
  configHelp: string;
  scoringHelp: string;

  /** La forme d'une réponse dépend parfois de la configuration. */
  answerSchema(config: C): ZodType<A>;
  correctSchema(config: C): ZodType<R>;

  answerFields(config: C): InputField[];
  correctFields(config: C): InputField[];

  formatAnswer(answer: A, config: C): string;
  formatCorrect(correct: R, config: C): string;
  describeScoring(scoring: S, config: C): string;

  /** Correcteur : fonction pure, même entrée → même sortie, toujours. */
  grade(input: GradeInput<C, S, A, R>): GradedAnswer[];
}

/* -------------------------------------------------------------------------
   Version « effacée » : ce que manipulent le registre et les écrans
   ------------------------------------------------------------------------- */

/**
 * Le registre range côte à côte des types dont les configurations n'ont rien
 * à voir. On les expose donc derrière une façade qui parle `unknown` et
 * valide elle-même : les écrans n'ont jamais à connaître les types concrets.
 */
export interface ErasedKind {
  kind: string;
  label: string;
  help: string;
  configExample: unknown;
  scoringExample: unknown;
  configHelp: string;
  scoringHelp: string;

  parseConfig(raw: unknown): unknown;
  parseScoring(raw: unknown): unknown;
  parseAnswer(raw: unknown, config: unknown): unknown;
  parseCorrect(raw: unknown, config: unknown): unknown;

  answerFields(config: unknown): InputField[];
  correctFields(config: unknown): InputField[];

  formatAnswer(answer: unknown, config: unknown): string;
  formatCorrect(correct: unknown, config: unknown): string;
  describeScoring(scoring: unknown, config: unknown): string;

  grade(input: GradeInput<unknown, unknown, unknown, unknown>): GradedAnswer[];
}

/**
 * Emballe un module typé en façade `unknown`. Les conversions de type sont
 * concentrées ici, une fois pour toutes, plutôt que dispersées dans le code.
 */
export function defineKind<C, S, A, R>(
  def: QuestionKindDefinition<C, S, A, R>,
): ErasedKind {
  return {
    kind: def.kind,
    label: def.label,
    help: def.help,
    configExample: def.configExample,
    scoringExample: def.scoringExample,
    configHelp: def.configHelp,
    scoringHelp: def.scoringHelp,

    parseConfig: (raw) => def.configSchema.parse(raw),
    parseScoring: (raw) => def.scoringSchema.parse(raw),
    parseAnswer: (raw, config) => def.answerSchema(config as C).parse(raw),
    parseCorrect: (raw, config) => def.correctSchema(config as C).parse(raw),

    answerFields: (config) => def.answerFields(config as C),
    correctFields: (config) => def.correctFields(config as C),

    formatAnswer: (answer, config) => def.formatAnswer(answer as A, config as C),
    formatCorrect: (correct, config) => def.formatCorrect(correct as R, config as C),
    describeScoring: (scoring, config) =>
      def.describeScoring(scoring as S, config as C),

    grade: (input) =>
      def.grade({
        config: input.config as C,
        scoring: input.scoring as S,
        correctAnswer: input.correctAnswer as R,
        entries: input.entries as AnswerEntry<A>[],
      }),
  };
}

/* -------------------------------------------------------------------------
   Petites aides communes aux correcteurs
   ------------------------------------------------------------------------- */

export function breakdown(
  kind: string,
  outcome: BonusOutcome,
  label: string,
  detail?: Record<string, unknown>,
): BonusBreakdown {
  return detail ? { kind, outcome, label, detail } : { kind, outcome, label };
}

/** Tri stable : les correcteurs rendent toujours les lignes dans le même ordre. */
export function byUserId(a: GradedAnswer, b: GradedAnswer): number {
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

/** « 3 points » / « 1 point ». */
export function points(n: number): string {
  return `${n} point${Math.abs(n) >= 2 ? "s" : ""}`;
}
