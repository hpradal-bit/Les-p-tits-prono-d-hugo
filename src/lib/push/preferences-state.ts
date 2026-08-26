export interface PreferencesState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const PREFERENCES_IDLE: PreferencesState = { status: "idle" };
