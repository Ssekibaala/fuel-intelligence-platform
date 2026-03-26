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
import { RouteIntelligencePage } from "./components/RouteIntelligencePage";
import { config } from "./lib/config";
import { AlertTriangle, FileText, LayoutDashboard, Route, Settings, ShieldCheck, Truck } from "lucide-react";

// Main app content component that can access global filter context
function AppContent() {
  const [activePage, setActivePage] = useState("dashboard");
  const [hasAutoNavigated, setHasAutoNavigated] = useState(false);
  const { state, actions } = useGlobalFilter();
  const { theme, toggleTheme } = useTheme();
  const { isAdmin } = useAuth();
  const navigationItems = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "assets", label: "Assets", icon: Truck },
    { key: "journeys", label: "Journeys", icon: Route },
    { key: "alerts", label: "Alerts", icon: AlertTriangle },
    { key: "reports", label: "Reports", icon: FileText },
    ...(isAdmin ? [{ key: "admin", label: "Admin", icon: ShieldCheck }] : []),
    { key: "settings", label: "Settings", icon: Settings },
  ];

  const pageQueryPrefixes: Record<string, string[]> = {
    dashboard: ["/api/dashboard/kpis", "/api/vehicles", "/api/fuel-events", "/api/daily-metrics"],
    assets: ["/api/vehicles", "/api/fuel-events", "/api/daily-metrics", "/api/raw-sensor-data"],
    journeys: ["/api/journey-intelligence"],
    alerts: ["/api/vehicles", "/api/fuel-events"],
    reports: ["/api/reports"],
    admin: ["/api/admin"],
    settings: ["/api/settings/branding", "/api/public/branding/logo"],
  };

  const invalidateActivePageQueries = () =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const firstKey = query.queryKey?.[0];
        if (typeof firstKey !== "string") return false;
        const prefixes = pageQueryPrefixes[activePage] || [];
        return prefixes.some((prefix) => firstKey.startsWith(prefix));
      },
      refetchType: "active",
    });

  useEffect(() => {
    if (!hasAutoNavigated && isAdmin) {
      setActivePage("admin");
      setHasAutoNavigated(true);
    }
  }, [hasAutoNavigated, isAdmin]);

  const handleRefresh = () => {
    actions.toggleLoading(true);
    
    invalidateActivePageQueries()
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
      case "journeys":
        return <RouteIntelligencePage pageId="journeys" />;
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
    <div className="min-h-[100dvh] w-full bg-background text-foreground antialiased relative overflow-x-hidden">
      {/* Animated liquid background */}
      <LiquidBackground />

      <div className="relative z-10 flex min-h-[100dvh]">
        {/* Sidebar (desktop/tablet) */}
        <div className="hidden md:block">
          <Sidebar activePage={activePage} onNavigate={handleNavigate} />
        </div>

        {/* Main content */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Header with global filters */}
          <Header onRefresh={handleRefresh} theme={theme} toggleTheme={toggleTheme} pageId={activePage} />

          {/* Page content */}
          <section className="flex-1 px-3 pt-3 pb-24 sm:px-4 sm:pt-4 sm:pb-24 lg:px-6 lg:pt-6 lg:pb-8">
            {renderPageContent()}
          </section>
        </main>
      </div>

      {/* Mobile App Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/85 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between gap-1 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)]">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavigate(item.key)}
                className={`flex min-w-0 flex-1 flex-col items-center rounded-lg px-1.5 py-1.5 transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                }`}
                aria-current={isActive ? "page" : undefined}
                data-testid={`mobile-nav-${item.key}`}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-1 max-w-full truncate text-[10px] font-medium leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
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
