import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  LOCK_REMINDER_SLOTS_DEFAULTS,
  LOCK_REMINDER_SLOTS_KEY,
  readLockReminderSlots,
  validateReminderSlots,
  reminderSlotsToRow,
  renderReminderText,
  type ReminderSlotInput,
} from "./lock-reminder-settings.ts";

describe("lecture des créneaux de rappel", () => {
  test("une base muette rend les deux créneaux par défaut", () => {
    assert.deepEqual(readLockReminderSlots({}), LOCK_REMINDER_SLOTS_DEFAULTS);
  });

  test("les valeurs de la base l'emportent sur les valeurs de repli", () => {
    const stored = [
      { id: "slot_1", enabled: false, hoursBefore: 48, title: "Titre 1", body: "Corps 1" },
      { id: "slot_2", enabled: true, hoursBefore: 2, title: "Titre 2", body: "Corps 2" },
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
});

describe("validation des créneaux", () => {
  const valid: ReminderSlotInput[] = [
    { enabled: true, hoursBefore: 24, title: "Titre", body: "Corps" },
    { enabled: true, hoursBefore: 10, title: "Titre 2", body: "Corps 2" },
  ];

  test("deux créneaux valides ne remontent aucune erreur", () => {
    assert.deepEqual(validateReminderSlots(valid), {});
  });

  test("un délai hors bornes est rejeté", () => {
    const errors = validateReminderSlots([
      { ...valid[0], hoursBefore: 0 },
      valid[1],
    ]);
    assert.ok(errors.slot_1?.hoursBefore);
  });

  test("un titre ou un texte vide est rejeté si le créneau est actif", () => {
    const errors = validateReminderSlots([
      { ...valid[0], title: "" },
      { ...valid[1], body: "   " },
    ]);
    assert.ok(errors.slot_1?.title);
    assert.ok(errors.slot_2?.body);
  });

  test("un créneau coupé n'a pas besoin d'un texte valide", () => {
    const errors = validateReminderSlots([
      { enabled: false, hoursBefore: 24, title: "", body: "" },
      valid[1],
    ]);
    assert.deepEqual(errors, {});
  });
});

test("reminderSlotsToRow écrit les deux id fixes dans l'ordre", () => {
  const row = reminderSlotsToRow([
    { enabled: true, hoursBefore: 24, title: "A", body: "B" },
    { enabled: false, hoursBefore: 10, title: "C", body: "D" },
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
