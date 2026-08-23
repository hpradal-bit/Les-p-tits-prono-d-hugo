import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  RULES_DEFAULTS,
  RULES_KEYS,
  describeQuiet,
  isKnownTimeZone,
  readRules,
  rulesToRows,
  validateRules,
  type NotificationRules,
} from "./rules.ts";

/**
 * Les garde-fous décident de ce qui part et quand. Une erreur ici ne casse pas
 * l'application : elle réveille six personnes à 3 h du matin, et elles coupent
 * tout. D'où ces tests.
 */

const base: NotificationRules = {
  enabled: true,
  maxPerDay: 3,
  quietFrom: "22:00",
  quietTo: "08:00",
  timeZone: "Europe/Paris",
};

describe("lecture des règles", () => {
  test("une base muette rend les valeurs de repli", () => {
    assert.deepEqual(readRules({}), RULES_DEFAULTS);
  });

  test("les valeurs de la base l'emportent sur les valeurs de repli", () => {
    const rules = readRules({
      [RULES_KEYS.enabled]: false,
      [RULES_KEYS.maxPerDay]: 7,
      [RULES_KEYS.quietFrom]: "23:30",
      [RULES_KEYS.quietTo]: "07:15",
      [RULES_KEYS.timeZone]: "Europe/Lisbon",
    });
    assert.deepEqual(rules, {
      enabled: false,
      maxPerDay: 7,
      quietFrom: "23:30",
      quietTo: "07:15",
      timeZone: "Europe/Lisbon",
    });
  });

  test("l'interrupteur n'est éteint que par un faux explicite", () => {
    // `null` en base veut dire « pas réglé », pas « éteint » : un réglage
    // effacé par mégarde ne doit pas rendre le groupe muet en silence.
    assert.equal(readRules({ [RULES_KEYS.enabled]: null }).enabled, true);
    assert.equal(readRules({ [RULES_KEYS.enabled]: false }).enabled, false);
  });
});

describe("validation", () => {
  test("un jeu de règles courant passe", () => {
    assert.deepEqual(validateRules(base), {});
  });

  test("le plafond doit être un entier de 1 à 20", () => {
    assert.ok(validateRules({ ...base, maxPerDay: 0 }).maxPerDay);
    assert.ok(validateRules({ ...base, maxPerDay: 21 }).maxPerDay);
    assert.ok(validateRules({ ...base, maxPerDay: 2.5 }).maxPerDay);
    assert.equal(validateRules({ ...base, maxPerDay: 1 }).maxPerDay, undefined);
    assert.equal(validateRules({ ...base, maxPerDay: 20 }).maxPerDay, undefined);
  });

  test("une heure illisible est refusée", () => {
    assert.ok(validateRules({ ...base, quietFrom: "25:00" }).quietFrom);
    assert.ok(validateRules({ ...base, quietTo: "8h" }).quietTo);
    assert.ok(validateRules({ ...base, quietFrom: "" }).quietFrom);
  });

  test("minuit et midi restent des heures valides", () => {
    assert.deepEqual(validateRules({ ...base, quietFrom: "00:00", quietTo: "12:00" }), {});
  });

  test("un fuseau inventé est refusé", () => {
    assert.ok(validateRules({ ...base, timeZone: "Europe/Pantin" }).timeZone);
    assert.equal(validateRules({ ...base, timeZone: "UTC" }).timeZone, undefined);
  });

  test("plusieurs erreurs remontent ensemble", () => {
    const errors = validateRules({ ...base, maxPerDay: 99, quietFrom: "nope", timeZone: "X/Y" });
    assert.equal(Object.keys(errors).length, 3);
  });
});

describe("heures de silence", () => {
  test("deux heures identiques valent « pas de silence »", () => {
    // C'est ainsi que `isQuiet` les interprète déjà : l'écran doit dire la
    // même chose que le moteur, sinon l'admin croit avoir réglé autre chose.
    assert.match(describeQuiet({ ...base, quietFrom: "08:00", quietTo: "08:00" }), /aucune/);
  });

  test("une plage normale est décrite telle quelle", () => {
    assert.equal(describeQuiet(base), "silence de 22:00 à 08:00");
  });

  test("une plage identique reste valide pour la validation", () => {
    assert.deepEqual(validateRules({ ...base, quietFrom: "08:00", quietTo: "08:00" }), {});
  });
});

describe("fuseaux", () => {
  test("reconnaît les fuseaux utiles au projet", () => {
    assert.ok(isKnownTimeZone("Europe/Paris"));
    assert.ok(isKnownTimeZone("UTC"));
  });

  test("rejette ce qui n'en est pas un", () => {
    assert.equal(isKnownTimeZone("Paris"), false);
    assert.equal(isKnownTimeZone(""), false);
  });
});

describe("écriture", () => {
  test("les cinq réglages partent vers les bonnes clés", () => {
    const rows = rulesToRows(base);
    assert.equal(rows.length, 5);
    assert.deepEqual(
      rows.map((r) => r.key).sort(),
      Object.values(RULES_KEYS).sort(),
    );
  });

  test("relire ce qu'on vient d'écrire redonne les mêmes règles", () => {
    // Aller-retour : c'est ce qui garantit qu'un réglage enregistré est bien
    // celui qui s'appliquera au prochain envoi.
    const custom: NotificationRules = {
      enabled: false, maxPerDay: 12, quietFrom: "21:45", quietTo: "06:30", timeZone: "UTC",
    };
    const settings = Object.fromEntries(rulesToRows(custom).map((r) => [r.key, r.value]));
    assert.deepEqual(readRules(settings), custom);
  });
});
