import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "./components/ThemeProvider";
import { GlobalFilterProvider, useGlobalFilter } from "./components/GlobalFilterContext";
import { LiquidBackground } from "./components/LiquidBackground";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { VehiclesPage } from "./components/VehiclesPage";
import { SettingsPage } from "./components/SettingsPage";
import { AlertsPage } from "./components/AlertsPage";
import { ReportsPage } from "./components/ReportsPage";

// Main app content component that can access global filter context
function AppContent() {
  const [activePage, setActivePage] = useState("dashboard");
  const { state, actions } = useGlobalFilter();
  const { theme, toggleTheme } = useTheme();

  // Auto-refresh functionality based on refresh interval
  useEffect(() => {
    if (state.refreshInterval > 0) {
      const interval = setInterval(() => {
        actions.updateTimestamp();
        // Trigger data refresh by invalidating queries
        queryClient.invalidateQueries();
      }, state.refreshInterval);

      return () => clearInterval(interval);
    }
  }, [state.refreshInterval, actions]);

  const handleRefresh = () => {
    actions.toggleLoading(true);
    
    // Invalidate all queries to trigger fresh data fetch
    queryClient.invalidateQueries()
      .then(() => {
        actions.updateTimestamp();
      })
      .finally(() => {
        setTimeout(() => actions.toggleLoading(false), 500); // Brief loading state
      });
  };

  const handleNavigate = (page: string) => {
    setActivePage(page);
    console.log('Navigating to:', page);
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <GlobalFilterProvider>
            <AppContent />
            <Toaster />
          </GlobalFilterProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
