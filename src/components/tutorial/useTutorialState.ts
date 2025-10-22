import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";

const STORAGE_KEY = "ora-tutorial-seen";

export type TutorialState = {
  hasSeenTutorial: boolean;
  shouldAutoStart: boolean;
  canTriggerTutorial: boolean;
  markTutorialSeen: () => Promise<void>;
  ready: boolean;
};

export function useTutorialState(): TutorialState {
  const { user, profile, loading, updatePreferences } = useAuth();
  const [localSeen, setLocalSeen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user) {
      setLocalSeen(window.localStorage.getItem(STORAGE_KEY) === "1");
    }
  }, [user]);

  const remoteSeen = user
    ? profile?.oraTutorialSeen === true || profile?.preferences?.oraTutorialSeen === true
    : false;
  const hasSeenTutorial = user ? remoteSeen : localSeen;

  const markTutorialSeen = useCallback(async () => {
    if (user) {
      await updatePreferences({ oraTutorialSeen: true });
    } else if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
      setLocalSeen(true);
    }
  }, [updatePreferences, user]);

  const shouldAutoStart = !loading && !!user && !hasSeenTutorial;
  const canTriggerTutorial = !loading && !hasSeenTutorial;

  const ready = !loading;

  return useMemo(
    () => ({
      hasSeenTutorial,
      shouldAutoStart,
      canTriggerTutorial,
      markTutorialSeen,
      ready,
    }),
    [canTriggerTutorial, hasSeenTutorial, markTutorialSeen, ready, shouldAutoStart],
  );
}
