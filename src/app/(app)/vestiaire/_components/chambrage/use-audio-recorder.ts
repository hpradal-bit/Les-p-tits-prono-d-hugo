"use client";

/**
 * Enregistrement d'un vocal via `MediaRecorder` : démarrer, arrêter (on garde
 * le blob), annuler (on le jette). Le format réel dépend du navigateur — Opus
 * dans un conteneur WebM sur Chrome/Firefox, MP4/AAC sur Safari — et c'est
 * exactement ce que `sniffAudioType` (`src/lib/chambrage/media.ts`) doit
 * détecter côté serveur : ce hook ne force aucun format, il constate celui
 * que `MediaRecorder.mimeType` a choisi.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_AUDIO_SECONDS } from "@/lib/chambrage/media";

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export type RecordingState = "idle" | "recording" | "stopped";

export interface RecordedVoice {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  /** URL objet pour la prévisualisation locale — révoquée par `cancel`/`reset`/au démontage. */
  previewUrl: string;
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<RecordedVoice | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedRef = useRef<RecordedVoice | null>(null);

  useEffect(() => {
    recordedRef.current = recorded;
  }, [recorded]);

  const stopTicking = useCallback(() => {
    if (tickTimer.current) {
      clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setRecorded(null);
    chunks.current = [];
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = mic;
      const mimeType = pickSupportedMimeType();
      const recorder = new MediaRecorder(mic, mimeType ? { mimeType } : undefined);
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.start();
      startedAt.current = Date.now();
      setElapsedSeconds(0);
      setState("recording");
      tickTimer.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
        setElapsedSeconds(seconds);
        if (seconds >= MAX_AUDIO_SECONDS) recorder.stop();
      }, 250);
    } catch {
      setError("Micro inaccessible. Vérifie les autorisations du navigateur.");
      setState("idle");
    }
  }, []);

  const stop = useCallback(() => {
    const recorder = mediaRecorder.current;
    if (!recorder || recorder.state === "inactive") return;
    stopTicking();
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    recorder.onstop = () => {
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunks.current, { type: mimeType });
      releaseStream();
      setRecorded({ blob, mimeType, durationSeconds, previewUrl: URL.createObjectURL(blob) });
      setState("stopped");
    };
    recorder.stop();
  }, [releaseStream, stopTicking]);

  const cancel = useCallback(() => {
    stopTicking();
    const recorder = mediaRecorder.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    releaseStream();
    chunks.current = [];
    setRecorded((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setElapsedSeconds(0);
    setState("idle");
  }, [releaseStream, stopTicking]);

  const reset = useCallback(() => {
    setRecorded((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setElapsedSeconds(0);
    setState("idle");
  }, []);

  useEffect(() => () => {
    stopTicking();
    releaseStream();
    if (recordedRef.current) URL.revokeObjectURL(recordedRef.current.previewUrl);
  }, [releaseStream, stopTicking]);

  return { state, elapsedSeconds, error, recorded, start, stop, cancel, reset };
}
