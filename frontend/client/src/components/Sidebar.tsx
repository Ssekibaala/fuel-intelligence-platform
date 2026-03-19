import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Truck,
  BarChart3,
  AlertTriangle,
  Settings,
  FileText,
  Moon,
  Sun,
  ShieldCheck,
  LogOut
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useBrandingLogo } from "@/hooks/use-branding-logo";

interface NavItem {
  key: string;
  title: string;
  icon: any;
  badge?: string | number;
}

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  theme: string;
  toggleTheme: () => void;
}

export function Sidebar({ activePage, onNavigate, theme, toggleTheme }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState("");
  const { logoSrc: brandLogo } = useBrandingLogo();
  const { user, profile, isAdmin, signOut } = useAuth();

  const updateDateTime = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setCurrentDateTime(`${dateStr} | ${timeStr} EAT`);
  };

  useEffect(() => {
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // todo: remove mock data - navigation items
  const navItems: NavItem[] = [
    { key: "dashboard", title: "Dashboard", icon: LayoutDashboard },
    { key: "assets", title: "Fleet Assets", icon: Truck },
    { key: "alerts", title: "Alerts", icon: AlertTriangle, badge: 3 },
    { key: "reports", title: "Reports", icon: FileText },
    ...(isAdmin ? [{ key: "admin", title: "Admin", icon: ShieldCheck }] : []),
    { key: "settings", title: "Settings", icon: Settings },
  ];

  return (
    <aside
      className={`
        transition-all duration-300 ease-out select-none flex-shrink-0 relative
        ${isExpanded ? "w-64" : "w-16"}
      `}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      data-testid="sidebar"
    >
      {/* Glass morphism background */}
      <div className="h-full flex flex-col bg-card/30 backdrop-blur-xl border-r border-border/40">
        <div
          className="h-14 border-b border-border/20 px-2 overflow-hidden"
        >
          <div
            className={`h-full flex items-center transition-all duration-300 ease-out ${
              isExpanded ? "justify-start gap-2 pl-1" : "justify-center gap-0"
            }`}
          >
            <div className="h-8 w-8 rounded-md bg-white border border-border/40 shadow-sm p-1.5 shrink-0">
              <img src={brandLogo} alt="Teletrac Fuel logo" className="h-full w-full object-contain" />
            </div>
            <span
              className={`whitespace-nowrap text-sm font-semibold tracking-tight text-foreground overflow-hidden transition-all duration-300 ease-out ${
                isExpanded ? "max-w-[140px] opacity-100 translate-x-0" : "max-w-0 opacity-0 -translate-x-2"
              }`}
            >
              Teletrac Fuel
            </span>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="mt-4 flex-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            
            return (
              <Button
                key={item.key}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                className={`
                  w-full justify-start gap-3 mb-1 h-10 transition-all duration-200
                  ${isActive 
                    ? "bg-primary/20 text-primary border-l-4 border-primary shadow-lg" 
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                  }
                  ${!isExpanded && "px-2"}
                `}
                onClick={() => onNavigate(item.key)}
                aria-current={isActive ? "page" : undefined}
                data-testid={`nav-${item.key}`}
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                {isExpanded && (
                  <>
                    <span className="text-sm font-medium animate-fade-in">{item.title}</span>
                    {item.badge && (
                      <span className="ml-auto bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Button>
            );
          })}
        </nav>

        {/* User profile */}
        <div className="p-3 border-t border-border/20">
          <div className="flex items-center gap-3">
            <Avatar className="w-9 h-9">
              <AvatarImage src="" alt="User avatar" />
              <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                {(user?.email || "U")[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isExpanded && (
              <div className="text-xs animate-fade-in">
                <div className="font-medium text-foreground">
                  {profile?.display_name || user?.email || "User"}
                </div>
                <div className="text-muted-foreground">{profile?.role || "client"}</div>
              </div>
            )}
          </div>
          {isExpanded && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="mt-3 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          )}
        </div>

        {/* Theme toggle and date/time - moved from header */}
        <div className="p-3 border-t border-border/20">
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              className="hover-elevate bg-card/40 backdrop-blur-sm border-border/30 h-8 w-8 p-0"
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {/* Current Date and Time */}
            {isExpanded && (
              <div className="text-xs font-mono text-muted-foreground">
                {currentDateTime}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

