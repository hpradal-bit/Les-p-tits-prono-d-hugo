"use client";

import { useRef } from "react";

/**
 * Appui long (souris ou tactile) : `onLongPress` se déclenche après `ms` si
 * le doigt/bouton reste enfoncé, `onTap` sinon — jamais les deux. C'est
 * exactement le geste WhatsApp/Messenger pour ouvrir le menu d'un message
 * (§2.10), sans bibliothèque tierce pour un geste aussi simple.
 */
export function useLongPress(
  onLongPress: () => void,
  onTap?: () => void,
  ms = 450,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const start = () => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, ms);
  };

  const clear = (triggerTap: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (triggerTap && !fired.current) onTap?.();
  };

  return {
    onMouseDown: start,
    onMouseUp: () => clear(true),
    onMouseLeave: () => clear(false),
    onTouchStart: start,
    onTouchEnd: () => clear(true),
    onTouchCancel: () => clear(false),
  };
}
