import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Truck,
  AlertTriangle,
  Settings,
  FileText,
  Route,
  ShieldCheck
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
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { logoSrc: brandLogo } = useBrandingLogo();
  const { isAdmin } = useAuth();

  // todo: remove mock data - navigation items
  const primaryNavItems: NavItem[] = [
    { key: "dashboard", title: "Dashboard", icon: LayoutDashboard },
    { key: "assets", title: "Fleet Assets", icon: Truck },
    { key: "journeys", title: "Journey Intelligence", icon: Route },
    { key: "alerts", title: "Alerts", icon: AlertTriangle, badge: 3 },
    { key: "reports", title: "Reports", icon: FileText },
    { key: "settings", title: "Settings", icon: Settings },
  ];

  const secondaryNavItems: NavItem[] = isAdmin
    ? [{ key: "admin", title: "Admin", icon: ShieldCheck }]
    : [];

  return (
    <aside
      className={`
        h-screen transition-all duration-300 ease-out select-none flex-shrink-0 relative
        ${isExpanded ? "w-64" : "w-16"}
      `}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      data-testid="sidebar"
    >
      {/* Glass morphism background */}
      <div className="flex h-full flex-col bg-card/30 backdrop-blur-xl border-r border-border/40">
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
        <nav className="mt-4 px-2">
          {primaryNavItems.map((item) => {
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

        <div className="mt-auto px-2 pb-3">
          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;

            return (
              <Button
                key={item.key}
                variant={isActive ? "default" : "ghost"}
                size="sm"
                className={`
                  mb-1 h-10 w-full justify-start gap-3 transition-all duration-200
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
                  <span className="text-sm font-medium animate-fade-in">{item.title}</span>
                )}
              </Button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

