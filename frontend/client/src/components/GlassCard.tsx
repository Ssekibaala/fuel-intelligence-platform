import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Status types for data-driven ambient glow
type StatusGlow = "excellent" | "good" | "warning" | "danger" | "neutral";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  premium?: boolean;
  statusGlow?: StatusGlow;
  pulseOnUpdate?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

export function GlassCard({
  children,
  className = "",
  hover = true,
  premium = true,
  statusGlow = "neutral",
  pulseOnUpdate = false,
  interactive = true,
  onClick
}: GlassCardProps) {
  
  // Get the appropriate glow class based on status
  const getGlowClass = (status: StatusGlow) => {
    switch (status) {
      case "excellent": return "glow-excellent";
      case "good": return "glow-good";
      case "warning": return "glow-warning";
      case "danger": return "glow-danger";
      case "neutral":
      default: return "";
    }
  };

  return (
    <Card
      className={cn(
        // Base glass styling for backwards compatibility
        "bg-card/55 backdrop-blur-sm border-border/30 shadow-md shadow-black/5",
        // Premium surface system - conditional based on interactivity
        premium && (hover && interactive ? "card-surface-premium-interactive" : "card-surface-premium"),
        // Additional motion class for non-premium cards
        !premium && hover && interactive && "motion-premium",
        // Status-based ambient glow
        statusGlow !== "neutral" && getGlowClass(statusGlow),
        // Pulse animation for data updates
        pulseOnUpdate && "pulse-data-update",
        className
      )}
      onClick={onClick}
    >
      {children}
    </Card>
  );
}

// Hook for triggering pulse animation on data updates
export function usePulseOnDataUpdate() {
  const triggerPulse = (element: HTMLElement | null) => {
    if (!element) return;
    
    // Remove existing animation
    element.classList.remove('pulse-data-update');
    
    // Force reflow to ensure class removal takes effect
    element.offsetHeight;
    
    // Add animation class
    element.classList.add('pulse-data-update');
    
    // Remove class after animation completes
    setTimeout(() => {
      element.classList.remove('pulse-data-update');
    }, 1000);
  };
  
  return { triggerPulse };
}
