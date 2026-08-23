"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker. Sans lui : pas de consultation hors ligne,
 * pas de notifications, pas d'installation sur l'écran d'accueil.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Un échec d'enregistrement ne doit jamais casser l'application.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
