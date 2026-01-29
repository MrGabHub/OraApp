import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import {
  GOOGLE_CALENDAR_SCOPES,
  storeGoogleToken,
  clearStoredGoogleToken,
} from "../lib/googleAuth";
import {
  DEFAULT_LANGUAGE,
  LOCAL_STORAGE_LANGUAGE_KEY,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  changeLanguage,
} from "../lib/i18n";

export type UserPreferences = {
  language?: SupportedLanguage;
  [key: string]: unknown;
};

export type UserProfile = {
  uid: string;
  email?: string;
  displayName?: string;
  role?: string;
  roles: string[];
  preferences: UserPreferences;
  createdAt?: unknown;
  language?: SupportedLanguage;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  profile: UserProfile | null;
  roles: string[];
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let targetLanguage: SupportedLanguage | null = null;
    if (user) {
      const candidate =
        profile?.language ?? (profile?.preferences?.language as SupportedLanguage | undefined);
      if (candidate && SUPPORTED_LANGUAGES.includes(candidate)) {
        targetLanguage = candidate;
      }
    } else if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_LANGUAGE_KEY);
      if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
        targetLanguage = stored as SupportedLanguage;
      } else {
        targetLanguage = DEFAULT_LANGUAGE;
      }
    }
    if (targetLanguage) {
      changeLanguage(targetLanguage);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_STORAGE_LANGUAGE_KEY, targetLanguage);
      }
    }
  }, [profile?.language, profile?.preferences?.language, user]);

  const parseProfile = useCallback(
    (firebaseUser: User, data?: Record<string, unknown>): UserProfile => {
      const roleField = typeof data?.role === "string" ? data.role : undefined;
      const rawRoles = Array.isArray(data?.roles) ? (data?.roles as string[]) : undefined;
      const roles = rawRoles && rawRoles.length > 0 ? rawRoles : roleField ? [roleField] : ["user"];
      const preferences: UserPreferences =
        typeof data?.preferences === "object" && data?.preferences !== null
          ? { ...(data.preferences as UserPreferences) }
          : {};
      const rootLanguage =
        typeof data?.language === "string" && SUPPORTED_LANGUAGES.includes(data.language as SupportedLanguage)
          ? (data.language as SupportedLanguage)
          : undefined;
      const preferenceLanguage =
        typeof preferences.language === "string" &&
        SUPPORTED_LANGUAGES.includes(preferences.language as SupportedLanguage)
          ? (preferences.language as SupportedLanguage)
          : undefined;
      const language = rootLanguage ?? preferenceLanguage ?? DEFAULT_LANGUAGE;
      preferences.language = language;

      return {
        uid: firebaseUser.uid,
        email: (data?.email as string | undefined) ?? firebaseUser.email ?? undefined,
        displayName:
          (data?.displayName as string | undefined) ?? firebaseUser.displayName ?? undefined,
        role: roleField ?? roles[0],
        roles,
        preferences,
        createdAt: data?.createdAt,
        language,
      };
    },
    [],
  );

  const loadProfile = useCallback(
    async (firebaseUser: User): Promise<UserProfile> => {
      const ref = doc(db, "users", firebaseUser.uid);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        const defaultData = {
          email: firebaseUser.email ?? null,
          displayName: firebaseUser.displayName ?? null,
          role: "user",
          roles: ["user"],
          language: DEFAULT_LANGUAGE,
          preferences: { language: DEFAULT_LANGUAGE },
          createdAt: new Date(),
        };
        await setDoc(ref, defaultData, { merge: true });
        const parsedDefault = parseProfile(firebaseUser, defaultData);
        setProfile(parsedDefault);
        return parsedDefault;
      }
      const data = snapshot.data();
      const parsed = parseProfile(firebaseUser, data);
      setProfile(parsed);
      return parsed;
    },
    [parseProfile],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          await loadProfile(firebaseUser);
        } catch (error) {
          console.error("Failed to load user profile", error);
          setProfile(null);
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [loadProfile]);

  const signInWithGoogleHandler = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    GOOGLE_CALENDAR_SCOPES.forEach((scope) => provider.addScope(scope));
    provider.setCustomParameters({
      prompt: "consent",
      ...(profile?.email ? { login_hint: profile.email } : {}),
    });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      storeGoogleToken(credential.accessToken);
    }
  }, [profile?.email]);

  const signOutHandler = useCallback(async () => {
    await firebaseSignOut(auth);
    clearStoredGoogleToken();
    setProfile(null);
  }, []);

  const updatePreferences = useCallback(
    async (prefs: Partial<UserPreferences>) => {
      if (!user) return;
      const ref = doc(db, "users", user.uid);
      const mergedPrefs = { ...(profile?.preferences ?? {}), ...prefs };
      const updatePayload: Record<string, unknown> = {
        preferences: mergedPrefs,
      };
      const hasLanguageField = Object.prototype.hasOwnProperty.call(prefs, "language");
      const nextLanguageValue =
        hasLanguageField &&
        typeof prefs.language === "string" &&
        SUPPORTED_LANGUAGES.includes(prefs.language as SupportedLanguage)
          ? (prefs.language as SupportedLanguage)
          : undefined;
      if (hasLanguageField && nextLanguageValue) {
        updatePayload.language = nextLanguageValue;
      }
      await setDoc(ref, updatePayload, { merge: true });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              preferences: mergedPrefs,
              language: hasLanguageField && nextLanguageValue ? nextLanguageValue : prev.language,
            }
          : prev,
      );
    },
    [profile?.preferences, user],
  );

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user);
    }
  }, [loadProfile, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      profile,
      roles: profile?.roles ?? [],
      signInWithGoogle: signInWithGoogleHandler,
      signOut: signOutHandler,
      updatePreferences,
      refreshProfile,
    }),
    [
      loading,
      profile,
      refreshProfile,
      signInWithGoogleHandler,
      signOutHandler,
      updatePreferences,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used inside an AuthProvider");
  }
  return ctx;
}
