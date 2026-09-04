import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  LOCK_REMINDER_SLOTS_DEFAULTS,
  LOCK_REMINDER_SLOTS_KEY,
  readLockReminderSlots,
  validateReminderSlots,
  reminderSlotsToRow,
  renderReminderText,
  reminderTargetSendTime,
  type ReminderSlotInput,
  type ReminderSlot,
} from "./lock-reminder-settings.ts";

describe("lecture des créneaux de rappel", () => {
  test("une base muette rend les deux créneaux par défaut", () => {
    assert.deepEqual(readLockReminderSlots({}), LOCK_REMINDER_SLOTS_DEFAULTS);
  });

  test("les valeurs de la base l'emportent sur les valeurs de repli", () => {
    const stored = [
      { id: "slot_1", enabled: false, mode: "hours_before", hoursBefore: 48, daysBefore: 1, clockTime: "16:00", title: "Titre 1", body: "Corps 1" },
      { id: "slot_2", enabled: true, mode: "fixed_time", hoursBefore: 2, daysBefore: 2, clockTime: "09:30", title: "Titre 2", body: "Corps 2" },
    ];
    const slots = readLockReminderSlots({ [LOCK_REMINDER_SLOTS_KEY]: stored });
    assert.deepEqual(slots, stored);
  });

  test("une forme corrompue retombe sur les valeurs par défaut", () => {
    assert.deepEqual(
      readLockReminderSlots({ [LOCK_REMINDER_SLOTS_KEY]: "n'importe quoi" }),
      LOCK_REMINDER_SLOTS_DEFAULTS,
    );
    assert.deepEqual(
      readLockReminderSlots({ [LOCK_REMINDER_SLOTS_KEY]: [{ id: "slot_1" }] }),
      LOCK_REMINDER_SLOTS_DEFAULTS,
    );
  });

  test("un créneau partiellement rempli garde le reste du défaut", () => {
    const stored = [
      { id: "slot_1", enabled: true, hoursBefore: 30 },
      { id: "slot_2", enabled: true, hoursBefore: 5 },
    ];
    const slots = readLockReminderSlots({ [LOCK_REMINDER_SLOTS_KEY]: stored });
    assert.equal(slots[0].hoursBefore, 30);
    assert.equal(slots[0].title, LOCK_REMINDER_SLOTS_DEFAULTS[0].title);
  });

  test("une ligne enregistrée avant le mode « heure précise » retombe sur hours_before", () => {
    const stored = [
      { id: "slot_1", enabled: true, hoursBefore: 24, title: "Titre 1", body: "Corps 1" },
      { id: "slot_2", enabled: true, hoursBefore: 10, title: "Titre 2", body: "Corps 2" },
    ];
    const slots = readLockReminderSlots({ [LOCK_REMINDER_SLOTS_KEY]: stored });
    assert.equal(slots[0].mode, "hours_before");
    assert.equal(slots[1].mode, "hours_before");
  });

  test("une heure d'horloge illisible retombe sur celle par défaut", () => {
    const stored = [
      { id: "slot_1", enabled: true, mode: "fixed_time", clockTime: "pas une heure" },
      { id: "slot_2", enabled: true, hoursBefore: 10 },
    ];
    const slots = readLockReminderSlots({ [LOCK_REMINDER_SLOTS_KEY]: stored });
    assert.equal(slots[0].clockTime, LOCK_REMINDER_SLOTS_DEFAULTS[0].clockTime);
  });
});

describe("validation des créneaux", () => {
  const hoursMode: ReminderSlotInput = {
    enabled: true, mode: "hours_before", hoursBefore: 24, daysBefore: 1, clockTime: "16:00",
    title: "Titre", body: "Corps",
  };
  const fixedMode: ReminderSlotInput = {
    enabled: true, mode: "fixed_time", hoursBefore: 10, daysBefore: 1, clockTime: "16:00",
    title: "Titre 2", body: "Corps 2",
  };

  test("deux créneaux valides ne remontent aucune erreur", () => {
    assert.deepEqual(validateReminderSlots([hoursMode, fixedMode]), {});
  });

  test("un délai hors bornes est rejeté (mode heures)", () => {
    const errors = validateReminderSlots([{ ...hoursMode, hoursBefore: 0 }, fixedMode]);
    assert.ok(errors.slot_1?.hoursBefore);
  });

  test("un nombre de jours hors bornes est rejeté (mode heure précise)", () => {
    const errors = validateReminderSlots([hoursMode, { ...fixedMode, daysBefore: 8 }]);
    assert.ok(errors.slot_2?.daysBefore);
  });

  test("une heure d'horloge invalide est rejetée (mode heure précise)", () => {
    const errors = validateReminderSlots([hoursMode, { ...fixedMode, clockTime: "25:99" }]);
    assert.ok(errors.slot_2?.clockTime);
  });

  test("un titre ou un texte vide est rejeté si le créneau est actif", () => {
    const errors = validateReminderSlots([
      { ...hoursMode, title: "" },
      { ...fixedMode, body: "   " },
    ]);
    assert.ok(errors.slot_1?.title);
    assert.ok(errors.slot_2?.body);
  });

  test("un créneau coupé n'a pas besoin d'un texte valide", () => {
    const errors = validateReminderSlots([
      { ...hoursMode, enabled: false, title: "", body: "" },
      fixedMode,
    ]);
    assert.deepEqual(errors, {});
  });
});

test("reminderSlotsToRow écrit les deux id fixes dans l'ordre", () => {
  const row = reminderSlotsToRow([
    { enabled: true, mode: "hours_before", hoursBefore: 24, daysBefore: 1, clockTime: "16:00", title: "A", body: "B" },
    { enabled: false, mode: "fixed_time", hoursBefore: 10, daysBefore: 0, clockTime: "09:00", title: "C", body: "D" },
  ]);
  assert.equal(row.key, LOCK_REMINDER_SLOTS_KEY);
  assert.equal(row.value[0].id, "slot_1");
  assert.equal(row.value[1].id, "slot_2");
});

describe("rendu du texte personnalisé", () => {
  test("remplace les trois emplacements", () => {
    const text = renderReminderText("{journee} : {heures} h, {restant} restant(s)", {
      journee: "J3", heures: 24, restant: 2,
    });
    assert.equal(text, "J3 : 24 h, 2 restant(s)");
  });

  test("un texte sans emplacement reste inchangé", () => {
    assert.equal(
      renderReminderText("N'oublie pas !", { journee: "J3", heures: 24, restant: 2 }),
      "N'oublie pas !",
    );
  });

  test("un emplacement répété est remplacé partout", () => {
    assert.equal(
      renderReminderText("{heures}h... {heures}h !", { journee: "J3", heures: 10, restant: 1 }),
      "10h... 10h !",
    );
  });
});

describe("l'instant d'envoi d'un créneau", () => {
  const timeZone = "Europe/Paris";
  // Samedi 5 septembre 2026, 15:00 heure de Paris (CEST, UTC+2) → 13:00 UTC.
  const locksAt = new Date("2026-09-05T13:00:00.000Z");

  test("mode heures_before : le verrouillage moins le délai", () => {
    const slot: ReminderSlot = {
      id: "slot_1", enabled: true, mode: "hours_before",
      hoursBefore: 24, daysBefore: 1, clockTime: "16:00", title: "", body: "",
    };
    const sent = reminderTargetSendTime(slot, locksAt, timeZone);
    assert.equal(sent.toISOString(), "2026-09-04T13:00:00.000Z");
  });

  test("mode heure précise : « la veille à 16h », indépendant de l'heure du match", () => {
    const slot: ReminderSlot = {
      id: "slot_1", enabled: true, mode: "fixed_time",
      hoursBefore: 24, daysBefore: 1, clockTime: "16:00", title: "", body: "",
    };
    const sent = reminderTargetSendTime(slot, locksAt, timeZone);
    // Vendredi 4 septembre 2026, 16h Paris (CEST, UTC+2) → 14h UTC.
    assert.equal(sent.toISOString(), "2026-09-04T14:00:00.000Z");
  });

  test("mode heure précise : « le jour même à 9h »", () => {
    const slot: ReminderSlot = {
      id: "slot_2", enabled: true, mode: "fixed_time",
      hoursBefore: 10, daysBefore: 0, clockTime: "09:00", title: "", body: "",
    };
    const sent = reminderTargetSendTime(slot, locksAt, timeZone);
    assert.equal(sent.toISOString(), "2026-09-05T07:00:00.000Z");
  });
});
