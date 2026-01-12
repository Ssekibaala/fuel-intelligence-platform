import { ReactNode } from "react";
import { GlassCard } from "./GlassCard";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: string;
  badgeVariant?: "success" | "warning" | "danger" | "info";
  icon?: ReactNode;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  onClick?: () => void;
}

export function KPICard({ 
  title, 
  value, 
  subtitle, 
  badge, 
  badgeVariant = "info", 
  icon, 
  trend,
  onClick 
}: KPICardProps) {
  const badgeStyles = {
    success: "bg-chart-2/20 text-chart-2 border-chart-2/30",
    warning: "bg-chart-3/20 text-chart-3 border-chart-3/30",
    danger: "bg-destructive/20 text-destructive border-destructive/30",
    info: "bg-primary/20 text-primary border-primary/30"
  };

  return (
    <GlassCard 
      className={`p-6 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {icon && <div className="text-muted-foreground">{icon}</div>}
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {title}
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">
            {value}
          </div>
          {subtitle && (
            <div className="text-sm text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {badge && (
            <span className={`px-2 py-1 text-xs font-medium rounded-md border ${badgeStyles[badgeVariant]}`}>
              {badge}
            </span>
          )}
          {trend && (
            <div className={`flex items-center text-xs font-semibold ${
              trend.direction === "up" ? "text-chart-2" : "text-destructive"
            }`}>
              <span className={`mr-1 ${
                trend.direction === "up" ? "↗" : "↘"
              }`}>
                {trend.direction === "up" ? "↗" : "↘"}
              </span>
              {Math.abs(trend.value)}%
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}