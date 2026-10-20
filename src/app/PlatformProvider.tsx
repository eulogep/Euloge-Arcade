import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {ENV} from '@/config/env';
import {newlyEarned, type RunRecord} from '@/features/achievements/evaluate';
import {readJson, STORAGE_KEYS, writeJson} from '@/lib/storage';
import {applySeasonalTheme} from '@/lib/season';
import * as auth from '@/services/authService';
import type {Profile} from '@/services/authService';
import {loadCatalog, loadPopularity, type CatalogData} from '@/services/catalogService';
import {
  LocalUserDataStore,
  mergeLocalIntoRemote,
  RemoteUserDataStore,
  type HistoryEntry,
  type UnlockedAchievement,
  type UserDataStore,
} from '@/services/userDataService';
import type {Game} from '@/types/game';

export interface Settings {
  theme: 'dark' | 'light';
  reducedMotion: boolean;
  /** Guest consent for on-device recommendations (signed-in players use their profile). */
  recommendationsConsent: boolean;
}

const DEFAULT_SETTINGS: Settings = {theme: 'dark', reducedMotion: false, recommendationsConsent: false};

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'info' | 'success' | 'error' | 'achievement';
}

type CatalogState =
  | {status: 'loading'}
  | {status: 'error'; message: string}
  | ({status: 'ready'} & CatalogData);

interface SessionUser {
  id: string;
  email: string | null;
}

interface PlatformContextValue {
  backendEnabled: boolean;
  catalog: CatalogState;
  games: Game[];
  gameById: Map<string, Game>;
  reloadCatalog: () => void;
  popularity: Record<string, number> | null;

  user: SessionUser | null;
  profile: Profile | null;
  authReady: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;

  favorites: Set<string>;
  toggleFavorite: (game: Game) => Promise<void>;
  history: HistoryEntry[];
  recordLaunch: (game: Game) => void;
  clearHistory: () => Promise<void>;
  runs: RunRecord[];
  submitRun: (run: RunRecord) => Promise<void>;
  unlocked: UnlockedAchievement[];

  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  recommendationsConsent: boolean;
  setRecommendationsConsent: (on: boolean) => Promise<void>;

  toasts: Toast[];
  notify: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used inside <PlatformProvider>');
  return ctx;
}

function applySettingsToDocument(settings: Settings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  applySeasonalTheme(root);
  if (settings.reducedMotion) root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
}

export function PlatformProvider({children}: {children: ReactNode}) {
  // ---- Catalog --------------------------------------------------------------
  const [catalog, setCatalog] = useState<CatalogState>({status: 'loading'});
  const [catalogNonce, setCatalogNonce] = useState(0);
  const [popularity, setPopularity] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCatalog((c) => (c.status === 'ready' ? c : {status: 'loading'}));
    loadCatalog()
      .then((data) => !cancelled && setCatalog({status: 'ready', ...data}))
      .catch((err) => {
        console.error('[catalog] load failed', err);
        if (!cancelled) setCatalog({status: 'error', message: 'Impossible de charger le catalogue.'});
      });
    loadPopularity()
      .then((p) => !cancelled && setPopularity(p))
      .catch(() => !cancelled && setPopularity(null));
    return () => {
      cancelled = true;
    };
  }, [catalogNonce]);

  const games = useMemo(() => (catalog.status === 'ready' ? catalog.games : []), [catalog]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const slugById = useMemo(() => new Map(games.map((g) => [g.id, g.slug])), [games]);

  // ---- Settings -------------------------------------------------------------
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readJson<Partial<Settings>>(STORAGE_KEYS.settings, {}),
  }));
  useEffect(() => {
    applySettingsToDocument(settings);
    writeJson(STORAGE_KEYS.settings, settings);
  }, [settings]);
  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({...s, ...patch})), []);

  // ---- Toasts ---------------------------------------------------------------
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-3), {...toast, id}]);
      window.setTimeout(() => dismissToast(id), toast.tone === 'achievement' ? 6000 : 4500);
    },
    [dismissToast],
  );

  // ---- Auth -----------------------------------------------------------------
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(!ENV.backendEnabled);

  useEffect(() => {
    if (!ENV.backendEnabled) return;
    let unsub = () => {};
    auth
      .getSession()
      .then((s) => setUser(s ? {id: s.user.id, email: s.user.email ?? null} : null))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
    auth
      .onAuthChange((s) => {
        setUser((prev) => {
          const next = s ? {id: s.user.id, email: s.user.email ?? null} : null;
          return prev?.id === next?.id ? prev : next;
        });
      })
      .then((fn) => (unsub = fn));
    return () => unsub();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await auth.fetchProfile(user.id));
    } catch (err) {
      console.error('[profile] load failed', err);
    }
  }, [user]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  // ---- Player data ----------------------------------------------------------
  const localStore = useMemo(() => new LocalUserDataStore(), []);
  const store: UserDataStore = useMemo(
    () => (user ? new RemoteUserDataStore(slugById) : localStore),
    [user, slugById, localStore],
  );

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[]>([]);

  const reloadPlayerData = useCallback(async (s: UserDataStore) => {
    const [f, h, r, a] = await Promise.all([s.getFavorites(), s.getHistory(), s.getRuns(), s.getAchievements()]);
    setFavorites(new Set(f));
    setHistory(h);
    setRuns(r);
    setUnlocked(a);
  }, []);

  useEffect(() => {
    if (!authReady || catalog.status !== 'ready') return;
    let cancelled = false;
    (async () => {
      try {
        if (store instanceof RemoteUserDataStore) {
          await mergeLocalIntoRemote(localStore, store, new Set(gameById.keys()));
        }
        if (!cancelled) await reloadPlayerData(store);
      } catch (err) {
        console.error('[player-data] load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, authReady, catalog.status, localStore, reloadPlayerData, gameById]);

  // Achievements are re-evaluated whenever the inputs change.
  const evaluatingRef = useRef(false);
  const achievementTitles = useMemo(
    () => new Map(catalog.status === 'ready' ? catalog.achievements.map((a) => [a.id, a.title]) : []),
    [catalog],
  );
  useEffect(() => {
    if (catalog.status !== 'ready' || evaluatingRef.current) return;
    const earned = newlyEarned(
      {
        launchedGameIds: [...new Set(history.map((h) => h.gameId))],
        favoriteCount: favorites.size,
        runs,
      },
      unlocked.map((u) => u.id),
    ).filter((id) => achievementTitles.has(id));
    if (earned.length === 0) return;
    evaluatingRef.current = true;
    store
      .unlockAchievements(earned)
      .then(() => {
        const now = new Date().toISOString();
        setUnlocked((u) => [...u, ...earned.map((id) => ({id, unlockedAt: now}))]);
        for (const id of earned) {
          notify({tone: 'achievement', title: 'Succès débloqué', body: achievementTitles.get(id)});
        }
      })
      .catch((err) => console.error('[achievements] unlock failed', err))
      .finally(() => {
        evaluatingRef.current = false;
      });
  }, [history, favorites, runs, unlocked, store, catalog.status, achievementTitles, notify]);

  const toggleFavorite = useCallback(
    async (game: Game) => {
      const on = !favorites.has(game.id);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (on) next.add(game.id);
        else next.delete(game.id);
        return next;
      });
      try {
        await store.setFavorite(game.id, on);
        notify({tone: 'success', title: on ? 'Ajouté aux favoris' : 'Retiré des favoris', body: game.title});
      } catch (err) {
        console.error('[favorites] update failed', err);
        setFavorites((prev) => {
          const next = new Set(prev);
          if (on) next.delete(game.id);
          else next.add(game.id);
          return next;
        });
        notify({tone: 'error', title: "Impossible de mettre à jour les favoris"});
      }
    },
    [favorites, store, notify],
  );

  const recordLaunch = useCallback(
    (game: Game) => {
      setHistory((h) => [{gameId: game.id, playedAt: new Date().toISOString()}, ...h].slice(0, 100));
      store.recordLaunch(game.id).catch((err) => console.error('[history] record failed', err));
    },
    [store],
  );

  const clearHistory = useCallback(async () => {
    await store.clearHistory();
    setHistory([]);
  }, [store]);

  const submitRun = useCallback(
    async (run: RunRecord) => {
      setRuns((r) => [run, ...r]);
      try {
        await store.submitRun(run);
      } catch (err) {
        console.error('[scores] submit failed', err);
      }
    },
    [store],
  );

  const recommendationsConsent = user ? Boolean(profile?.recommendationsConsent) : settings.recommendationsConsent;
  const setRecommendationsConsent = useCallback(
    async (on: boolean) => {
      if (user) {
        await auth.updateProfile(user.id, {recommendationsConsent: on});
        setProfile((p) => (p ? {...p, recommendationsConsent: on} : p));
      } else {
        updateSettings({recommendationsConsent: on});
      }
    },
    [user, updateSettings],
  );

  const value: PlatformContextValue = {
    backendEnabled: ENV.backendEnabled,
    catalog,
    games,
    gameById,
    reloadCatalog: () => setCatalogNonce((n) => n + 1),
    popularity,
    user,
    profile,
    authReady,
    isAdmin: profile?.role === 'admin',
    refreshProfile,
    signOut,
    favorites,
    toggleFavorite,
    history,
    recordLaunch,
    clearHistory,
    runs,
    submitRun,
    unlocked,
    settings,
    updateSettings,
    recommendationsConsent,
    setRecommendationsConsent,
    toasts,
    notify,
    dismissToast,
  };

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}
