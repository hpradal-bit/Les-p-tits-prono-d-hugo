"use client";

/**
 * Les trois gestes d'une bulle de message, unifiés sur les Pointer Events
 * (souris/tactile/stylet en un seul modèle, pour ne jamais faire concurrence
 * à eux-mêmes sur un écran tactile) :
 *  - appui long → menu d'actions (§2.10) ;
 *  - glissement vers la droite → répondre, comme WhatsApp/Messenger ;
 *  - double-tap → réaction rapide ❤️, comme Messenger/Instagram.
 * Un déplacement vertical annule le geste (c'est un défilement de la liste),
 * un déplacement horizontal annule l'appui long (c'est un glissement).
 */

import { useCallback, useRef, useState } from "react";

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 8;
const SWIPE_TRIGGER_PX = 56;
const SWIPE_MAX_PX = 76;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_RADIUS_PX = 24;

export function useMessageGestures({
  onLongPress,
  onSwipeReply,
  onDoubleTap,
}: {
  onLongPress: () => void;
  onSwipeReply: () => void;
  onDoubleTap: () => void;
}) {
  const [dragX, setDragX] = useState(0);

  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const longPressFired = useRef(false);
  const pointerId = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapAt = useRef(0);
  const lastTapX = useRef(0);
  const lastTapY = useRef(0);

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startX.current = e.clientX;
      startY.current = e.clientY;
      dragging.current = false;
      longPressFired.current = false;
      pointerId.current = e.pointerId;
      clearTimer();
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [onLongPress],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!dragging.current) {
      if (Math.abs(dy) > MOVE_CANCEL_PX && Math.abs(dy) > Math.abs(dx)) {
        // Défilement vertical de la liste : on abandonne complètement le geste.
        clearTimer();
        pointerId.current = null;
        return;
      }
      if (Math.abs(dx) > MOVE_CANCEL_PX) {
        dragging.current = true;
        clearTimer();
      }
    }
    if (dragging.current) {
      setDragX(Math.max(0, Math.min(SWIPE_MAX_PX, dx)));
    }
  }, []);

  const endGesture = useCallback(
    (endX: number, endY: number) => {
      clearTimer();
      if (dragging.current) {
        if (dragX >= SWIPE_TRIGGER_PX) onSwipeReply();
      } else if (!longPressFired.current) {
        const now = Date.now();
        const closeEnough =
          Math.abs(endX - lastTapX.current) < DOUBLE_TAP_RADIUS_PX &&
          Math.abs(endY - lastTapY.current) < DOUBLE_TAP_RADIUS_PX;
        if (now - lastTapAt.current < DOUBLE_TAP_MS && closeEnough) {
          onDoubleTap();
          lastTapAt.current = 0;
        } else {
          lastTapAt.current = now;
          lastTapX.current = endX;
          lastTapY.current = endY;
        }
      }
      dragging.current = false;
      pointerId.current = null;
      setDragX(0);
    },
    [dragX, onSwipeReply, onDoubleTap],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      endGesture(e.clientX, e.clientY);
    },
    [endGesture],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    clearTimer();
    dragging.current = false;
    pointerId.current = null;
    setDragX(0);
  }, []);

  return {
    dragX,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
