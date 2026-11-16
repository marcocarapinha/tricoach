import { useState } from "react";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { MotionConfig } from "framer-motion";
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider";
import { Loader2 } from "lucide-react";
import { DataProvider, useData } from "@/lib/data/DataProvider";
import Layout from "@/components/Layout";
import TodayPage from "@/pages/TodayPage";
import DashboardPage from "@/pages/DashboardPage";
import StatsPage from "@/pages/StatsPage";
import LoadPage from "@/pages/LoadPage";
import HealthPage from "@/pages/HealthPage";
import ActivitiesPage from "@/pages/ActivitiesPage";
import SettingsPage from "@/pages/SettingsPage";
import LoginPage from "@/pages/LoginPage";
import PlanPage from "@/pages/PlanPage";
import ActivityDetailPage from "@/pages/ActivityDetailPage";
import RecordsPage from "@/pages/RecordsPage";
import ExercisesPage from "@/pages/ExercisesPage";
import MfaChallenge from "@/components/auth/MfaChallenge";
import OnboardingPage from "@/pages/OnboardingPage";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

function Gate() {
  const { needsLogin, needsMfa, loading, error, core, store } = useData();
  const location = useLocation();
  const [later, setLater] = useState(() => sessionStorage.getItem("tricoach.onboardingLater") === "1");
  if (needsLogin) return <LoginPage />;
  if (needsMfa) return <MfaChallenge />;
  if (error) return <div className="p-8 text-sm text-bad">Erro a carregar dados: {String((error as Error).message ?? error)}</div>;
  if (loading || !core) return <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A carregar…</div>;
  // conta nova: assistente de configuração antes de entrar na app (pode adiar para mais tarde)
  if (store.mode === "supabase" && !core.profile.onboardedAt && !later && location.pathname !== "/boas-vindas") return <OnboardingPage onLater={() => setLater(true)} />;
  return (
    <Routes>
      <Route path="boas-vindas" element={<OnboardingPage />} />
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="estatisticas" element={<StatsPage />} />
        <Route path="carga" element={<LoadPage />} />
        <Route path="saude" element={<HealthPage />} />
        <Route path="plano" element={<PlanPage />} />
        <Route path="atividades" element={<ActivitiesPage />} />
        <Route path="atividades/:id" element={<ActivityDetailPage />} />
        <Route path="recordes" element={<RecordsPage />} />
        <Route path="exercicios" element={<ExercisesPage />} />
        <Route path="definicoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="bottom-right" richColors />;
}

export default function App() {
  return (
    <ThemeProvider>
      {/* reducedMotion="user": todas as animações Framer Motion respeitam prefers-reduced-motion */}
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <DataProvider>
              <Gate />
              <ThemedToaster />
            </DataProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
