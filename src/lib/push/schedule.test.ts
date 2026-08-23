import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  toMinutes, isQuiet, scheduleFor, scheduleForAll, dedupeKey, dayKey, minutesOfDay,
  type QuietHours,
} from "./schedule.ts";

test("lecture d'une heure", () => {
  assert.equal(toMinutes("22:00"), 1320);
  assert.equal(toMinutes("08:30"), 510);
  assert.equal(toMinutes("0:00"), 0);
  assert.equal(toMinutes("24:00"), null);
  assert.equal(toMinutes("bonjour"), null);
});

test("la plage de silence traverse minuit", () => {
  const from = 1320; // 22:00
  const to = 480;    // 08:00
  assert.equal(isQuiet(1380, from, to), true,  "23:00 est dans le silence");
  assert.equal(isQuiet(60, from, to),   true,  "01:00 aussi");
  assert.equal(isQuiet(479, from, to),  true,  "07:59 encore");
  assert.equal(isQuiet(480, from, to),  false, "08:00 non");
  assert.equal(isQuiet(1200, from, to), false, "20:00 non");
});

test("une plage de journée ne traverse pas minuit", () => {
  assert.equal(isQuiet(780, 600, 900), true);   // 13:00 entre 10:00 et 15:00
  assert.equal(isQuiet(960, 600, 900), false);  // 16:00 dehors
});

test("une plage vide ne fait jamais silence", () => {
  assert.equal(isQuiet(0, 480, 480), false);
});

const quiet = { from: "22:00", to: "08:00", timeZone: "Europe/Paris" };

test("hors silence, l'envoi part tout de suite", () => {
  const at = new Date("2026-09-05T18:00:00+02:00");
  assert.equal(scheduleFor(at, quiet).getTime(), at.getTime());
});

test("dans le silence du soir, l'envoi est reporté au matin", () => {
  const at = new Date("2026-09-05T23:40:00+02:00");
  const out = scheduleFor(at, quiet);
  assert.ok(out.getTime() > at.getTime(), "reporté");
  assert.equal(minutesOfDay(out, quiet.timeZone), 480, "à 08:00 pile");
});

test("dans le silence du petit matin, l'envoi attend 8 h le jour même", () => {
  const at = new Date("2026-09-06T03:15:00+02:00");
  const out = scheduleFor(at, quiet);
  assert.equal(minutesOfDay(out, quiet.timeZone), 480);
  assert.ok(out.getTime() - at.getTime() < 6 * 3_600_000, "moins de six heures d'attente");
});

test("une notification n'est jamais supprimée par le silence, seulement décalée", () => {
  for (let h = 0; h < 24; h++) {
    const at = new Date(`2026-09-05T${String(h).padStart(2, "0")}:30:00+02:00`);
    const out = scheduleFor(at, quiet);
    assert.ok(out.getTime() >= at.getTime(), `heure ${h}`);
    assert.equal(isQuiet(minutesOfDay(out, quiet.timeZone), 1320, 480), false, `heure ${h} sort du silence`);
  }
});

test("une plage illisible laisse passer plutôt que de tout bloquer", () => {
  const at = new Date("2026-09-05T23:40:00+02:00");
  assert.equal(scheduleFor(at, { from: "n'importe quoi", to: "08:00", timeZone: "Europe/Paris" }).getTime(), at.getTime());
});

test("la clé de regroupement couvre toute une journée", () => {
  assert.equal(dedupeKey("lock_reminder", "round-1", "2026-09-05"), "lock_reminder:round-1:2026-09-05");
  assert.equal(dedupeKey("round_digest", "round-1"), "round_digest:round-1");
});

test("le jour civil suit le fuseau du jeu", () => {
  // 00 h 30 à Paris le 6 septembre, c'est encore le 5 en temps universel.
  assert.equal(dayKey(new Date("2026-09-05T22:30:00Z"), "Europe/Paris"), "2026-09-06");
});

describe("cumul des plages de silence", () => {
  /**
   * L'espace admin promet au groupe : « chaque joueur peut se montrer plus
   * silencieux, jamais plus bruyant ». C'est ici que cette promesse tient ou
   * s'effondre — les heures du joueur s'ajoutent à celles du groupe.
   */
  const tz = "Europe/Paris";
  const groupe: QuietHours = { from: "22:00", to: "08:00", timeZone: tz };

  /** 20 h 00, heure de Paris, un jour d'été. */
  const at = (hhmm: string) => new Date(`2026-09-05T${hhmm}:00+02:00`);

  test("sans plage, rien n'est reporté", () => {
    assert.equal(scheduleForAll(at("23:00"), []).toISOString(), at("23:00").toISOString());
  });

  test("une seule plage se comporte comme avant", () => {
    assert.equal(
      scheduleForAll(at("23:00"), [groupe]).toISOString(),
      scheduleFor(at("23:00"), groupe).toISOString(),
    );
  });

  test("un joueur qui vide ses heures reste tenu par celles du groupe", () => {
    // Le cœur du sujet : avant, ses heures remplaçaient celles du groupe et
    // il recevait le message à 23 h. Maintenant, il attend 8 h comme tout
    // le monde.
    const aucune: QuietHours = { from: "08:00", to: "08:00", timeZone: tz };
    const sent = scheduleForAll(at("23:00"), [groupe, aucune]);
    assert.equal(minutesOfDay(sent, tz), 8 * 60);
    assert.ok(sent > at("23:00"));
  });

  test("un joueur plus strict est respecté au-delà du groupe", () => {
    // Silence jusqu'à 10 h chez lui : le groupe libère à 8 h, lui pas.
    const strict: QuietHours = { from: "21:00", to: "10:00", timeZone: tz };
    const sent = scheduleForAll(at("23:00"), [groupe, strict]);
    assert.equal(minutesOfDay(sent, tz), 10 * 60);
  });

  test("sortir d'une plage peut faire entrer dans l'autre", () => {
    // Groupe muet jusqu'à 8 h, joueur muet de 8 h à 9 h : le report en
    // chaîne doit aboutir à 9 h, pas s'arrêter à 8 h.
    const matinal: QuietHours = { from: "08:00", to: "09:00", timeZone: tz };
    const sent = scheduleForAll(at("23:00"), [groupe, matinal]);
    assert.equal(minutesOfDay(sent, tz), 9 * 60);
  });

  test("une heure libre pour tous n'est jamais reportée", () => {
    const strict: QuietHours = { from: "21:00", to: "10:00", timeZone: tz };
    assert.equal(
      scheduleForAll(at("15:00"), [groupe, strict]).toISOString(),
      at("15:00").toISOString(),
    );
  });

  test("deux plages couvrant la journée entière ne bouclent pas", () => {
    // Union = 24 h : aucun instant n'est libre. On s'en tient au groupe
    // plutôt que de tourner indéfiniment.
    const complement: QuietHours = { from: "08:00", to: "22:00", timeZone: tz };
    const sent = scheduleForAll(at("23:00"), [groupe, complement]);
    assert.equal(minutesOfDay(sent, tz), 8 * 60);
  });

  test("une plage illisible est ignorée, pas fatale", () => {
    const cassee: QuietHours = { from: "n'importe quoi", to: "08:00", timeZone: tz };
    assert.equal(
      scheduleForAll(at("15:00"), [cassee]).toISOString(),
      at("15:00").toISOString(),
    );
  });
});
