import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "./components/ThemeProvider";
import { GlobalFilterProvider, useGlobalFilter } from "./components/GlobalFilterContext";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import { LoginPage } from "./components/LoginPage";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { LiquidBackground } from "./components/LiquidBackground";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { VehiclesPage } from "./components/VehiclesPage";
import { SettingsPage } from "./components/SettingsPage";
import { AlertsPage } from "./components/AlertsPage";
import { ReportsPage } from "./components/ReportsPage";
import { AdminPage } from "./components/AdminPage";
import { config } from "./lib/config";

// Main app content component that can access global filter context
function AppContent() {
  const [activePage, setActivePage] = useState("dashboard");
  const [hasAutoNavigated, setHasAutoNavigated] = useState(false);
  const { state, actions } = useGlobalFilter();
  const { theme, toggleTheme } = useTheme();
  const { isAdmin } = useAuth();
  const invalidateApiQueries = () =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const firstKey = query.queryKey?.[0];
        return typeof firstKey === "string" && firstKey.startsWith("/api");
      },
      refetchType: "active",
    });

  // Auto-refresh functionality based on refresh interval
  useEffect(() => {
    if (state.refreshInterval > 0) {
      const interval = setInterval(() => {
        actions.updateTimestamp();
        // Trigger data refresh by invalidating queries
        invalidateApiQueries();
      }, state.refreshInterval);

      return () => clearInterval(interval);
    }
  }, [state.refreshInterval, actions]);

  useEffect(() => {
    if (!hasAutoNavigated && isAdmin) {
      setActivePage("admin");
      setHasAutoNavigated(true);
    }
  }, [hasAutoNavigated, isAdmin]);

  const handleRefresh = () => {
    actions.toggleLoading(true);
    
    // Invalidate all queries to trigger fresh data fetch
    invalidateApiQueries()
      .then(() => {
        actions.updateTimestamp();
      })
      .finally(() => {
        setTimeout(() => actions.toggleLoading(false), 500); // Brief loading state
      });
  };

  const handleNavigate = (page: string) => {
    setActivePage(page);
  };

  const renderPageContent = () => {
    // Components can access global filter state via useGlobalFilter hook
    switch (activePage) {
      case "dashboard":
        return <Dashboard pageId="dashboard" />;
      case "assets":
        return <VehiclesPage pageId="assets" />;
      case "alerts":
        return <AlertsPage pageId="alerts" />;
      case "reports":
        return <ReportsPage pageId="reports" />;
      case "admin":
        return <AdminPage pageId="admin" />;
      case "settings":
        return <SettingsPage pageId="settings" />;
      default:
        return <Dashboard pageId="dashboard" />;
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground antialiased relative overflow-hidden">
      {/* Animated liquid background */}
      <LiquidBackground />

      <div className="flex h-screen relative z-10">
        {/* Sidebar */}
        <Sidebar activePage={activePage} onNavigate={handleNavigate} theme={theme} toggleTheme={toggleTheme} />

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {/* Header with global filters */}
          <Header onRefresh={handleRefresh} />

          {/* Page content */}
          <section className="w-full p-6">
            {renderPageContent()}
          </section>
        </main>
      </div>
    </div>
  );
}

function AppWithAuth() {
  const { loading, user } = useAuth();
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadStatus = async () => {
      try {
        const baseUrl = (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");
        const response = await fetch(`${baseUrl}/api/onboarding/status`);
        if (!response.ok) throw new Error("Failed to load onboarding status");
        const data = await response.json();
        if (mounted) {
          setNeedsOnboarding(Boolean(data?.needsOnboarding));
        }
      } catch {
        if (mounted) {
          setNeedsOnboarding(false);
        }
      } finally {
        if (mounted) setOnboardingLoading(false);
      }
    };

    loadStatus();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading session...</div>
      </div>
    );
  }

  if (onboardingLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Preparing onboarding...</div>
      </div>
    );
  }

  if (needsOnboarding && !user) {
    return <OnboardingWizard />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AppContent />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <GlobalFilterProvider>
              <AppWithAuth />
              <Toaster />
            </GlobalFilterProvider>
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
