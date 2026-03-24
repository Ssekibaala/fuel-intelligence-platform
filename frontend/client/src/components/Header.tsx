import { Button } from "@/components/ui/button";
import { LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useGlobalFilter } from "./GlobalFilterContext";
import { HeadingLogo } from "./HeadingLogo";
import { getPageTitle } from "./PageTitles";

interface HeaderProps {
  onRefresh: () => void;
  theme: string;
  toggleTheme: () => void;
  pageId: string;
  selectedVehicle?: string;
  onVehicleChange?: (vehicle: string) => void;
}

export function Header({ onRefresh: _onRefresh, theme, toggleTheme, pageId }: HeaderProps) {
  const { user, clients, isAdmin, signOut } = useAuth();
  const { state: filterState } = useGlobalFilter();
  const { title, subtitle } = getPageTitle(pageId);

  const activeClientName =
    clients.find((client) => client.id === filterState.selectedClientId)?.name ??
    (clients.length === 1 ? clients[0].name : null) ??
    (isAdmin ? "Admin Workspace" : "Client Workspace");

  const email = user?.email ?? "";
  const welcomeName = email ? email.split("@")[0] : "User";

  return (
    <header className="sticky top-0 z-20 hidden border-b border-border/20 bg-background/55 backdrop-blur-xl md:block">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 lg:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <HeadingLogo className="shrink-0 px-1.5 py-1 sm:px-2 sm:py-1.5" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold text-foreground">
              {title}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {subtitle}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="min-w-0 text-right leading-tight">
            <div className="truncate text-[13px] font-semibold text-foreground">
              Welcome, {welcomeName}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {activeClientName}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="h-8 w-8 shrink-0 border-border/40 bg-card/60 p-0"
            data-testid="button-theme-toggle"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut()}
            className="h-8 w-8 shrink-0 border-border/40 bg-card/60 p-0"
            data-testid="button-sign-out"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
