import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { demoStore, supabaseStore, type CoreData, type Store } from "./store";
import type { CheckIn, Suggestion, SuggestionStatus, Wellness } from "../types";
import { buildSeason, type PhaseSegment } from "../engine/periodization";
import { addDays, todayISO } from "../dates";
import { type LoadDay, loadSeries } from "../engine/load";
import { evaluateRules, indexWellness, readiness, recommend, type Readiness, type Recommendation } from "../engine/health";

export interface Derived {
  today: string;
  idx: Map<string, Wellness>;
  load: LoadDay[];
  readiness: Readiness;
  readinessHistory: Readiness[];
  recommendation: Recommendation;
  suggestions: Suggestion[];
  season: PhaseSegment[];
  checkinByDate: Map<string, CheckIn>;
}

interface Ctx {
  store: Store;
  session: Session | null;
  needsLogin: boolean;
  /** sessão com palavra-passe mas falta o código 2FA (fator TOTP verificado e sessão aal1) */
  needsMfa: boolean;
  useDemo: () => void;
  core: CoreData | undefined;
  derived: Derived | undefined;
  loading: boolean;
  error: unknown;
  statuses: Record<string, SuggestionStatus>;
  setStatus: (s: Suggestion, st: SuggestionStatus) => Promise<void>;
  reload: () => void;
}

const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [forceDemo, setForceDemo] = useState(() => !supabase || sessionStorage.getItem("tricoach.forceDemo") === "1");

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); qc.invalidateQueries(); });
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  // nível de autenticação da sessão (aal1 = palavra-passe; aal2 = palavra-passe + código)
  const [aal, setAal] = useState<{ token: string; needsMfa: boolean } | null>(null);
  useEffect(() => {
    if (!supabase || !session) { setAal(null); return; }
    let alive = true;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (alive) setAal({ token: session.access_token, needsMfa: data?.nextLevel === "aal2" && data?.currentLevel !== "aal2" });
    });
    return () => { alive = false; };
  }, [session]);
  const aalReady = !session || aal?.token === session.access_token;
  const needsMfa = !!session && !forceDemo && aalReady && !!aal?.needsMfa;

  const store = useMemo<Store>(() => (supabase && session && !forceDemo ? supabaseStore() : demoStore()), [session, forceDemo]);
  const needsLogin = !!supabase && authReady && !session && !forceDemo;

  const coreQ = useQuery({ queryKey: ["core", store.mode, session?.user.id], queryFn: () => store.loadCore(), enabled: authReady && !needsLogin && (forceDemo || (aalReady && !needsMfa)), staleTime: 5 * 60_000 });
  const statusQ = useQuery({ queryKey: ["statuses", store.mode], queryFn: () => store.suggestionStatuses(), enabled: authReady && !needsLogin && (forceDemo || (aalReady && !needsMfa)) });

  const derived = useMemo<Derived | undefined>(() => {
    const c = coreQ.data;
    if (!c) return undefined;
    const today = todayISO();
    const idx = indexWellness(c.wellness);
    const earliest = c.activities.reduce((m, a) => (a.date < m ? a.date : m), addDays(today, -60));
    const load = loadSeries(c.activities, c.profile, earliest, today);
    const checkinByDate = new Map(c.checkins.map((x) => [x.date, x]));
    const r = readiness(today, idx, load, c.profile, checkinByDate.get(today));
    const readinessHistory = Array.from({ length: 30 }, (_, i) => { const d = addDays(today, i - 29); return readiness(d, idx, load, c.profile, checkinByDate.get(d)); });
    const suggestions = evaluateRules({ date: today, acts: c.activities, idx, load, profile: c.profile, nextRace: c.nextRace });
    const season = buildSeason(c.races, addDays(today, -730), addDays(today, 540));
    return { today, idx, load, readiness: r, readinessHistory, recommendation: recommend(r, c.activities, today), suggestions, season, checkinByDate };
  }, [coreQ.data]);

  const statuses = statusQ.data ?? {};

  const value: Ctx = {
    store, session, needsLogin, needsMfa,
    useDemo: () => { sessionStorage.setItem("tricoach.forceDemo", "1"); setForceDemo(true); },
    core: coreQ.data, derived,
    loading: !authReady || !aalReady || coreQ.isLoading,
    error: coreQ.error,
    statuses,
    setStatus: async (s, st) => {
      await store.setSuggestionStatus(s, st);
      qc.setQueryData(["statuses", store.mode], { ...statuses, [s.id]: st });
    },
    reload: () => qc.invalidateQueries(),
  };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData fora do DataProvider");
  return c;
}

/** Atalho para componentes que só renderizam com dados carregados. */
export function useLoaded() {
  const c = useData();
  return { ...c, core: c.core!, derived: c.derived! };
}
