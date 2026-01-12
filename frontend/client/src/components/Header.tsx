import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Shield } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface HeaderProps {
  onRefresh: () => void;
  selectedVehicle?: string;
  onVehicleChange?: (vehicle: string) => void;
}

export function Header({ onRefresh }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [currentDateTime, setCurrentDateTime] = useState("");

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

  return (
    <header className="sticky top-0 z-20 bg-background/60 backdrop-blur-xl border-b border-border/20">
      <div className="max-w-[1400px] mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Right side - Controls */}
          <div className="flex items-center gap-3">
            {/* Theme toggle and date/time moved to sidebar */}
          </div>
        </div>
      </div>
    </header>
  );
}