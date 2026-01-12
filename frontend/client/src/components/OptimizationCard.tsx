import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { useGlobalFilter } from "./GlobalFilterContext";

interface OptimizationCardProps {
  assetId: string;
  inefficiencyDriver: string;
  expectedSavings: number;
  severity: "High" | "Medium" | "Low";
  trend: number;
  onClick?: () => void;
}

export function OptimizationCard({ 
  assetId, 
  inefficiencyDriver, 
  expectedSavings, 
  severity, 
  trend,
  onClick 
}: OptimizationCardProps) {
  const { state: filterState } = useGlobalFilter();
  const getSeverityColor = () => {
    switch (severity) {
      case "High": return "text-destructive bg-destructive/20 border-destructive/30";
      case "Medium": return "text-accent-foreground bg-accent/20 border-accent/30";
      case "Low": return "text-primary bg-primary/20 border-primary/30";
    }
  };

  // Simple sparkline data simulation
  const generateSparklineData = () => {
    const points = [];
    let value = 50 + Math.random() * 30;
    for (let i = 0; i < 12; i++) {
      value += (Math.random() - 0.5) * 10;
      value = Math.max(20, Math.min(80, value));
      points.push(value);
    }
    return points;
  };

  const sparklineData = generateSparklineData();
  const maxValue = Math.max(...sparklineData);
  const minValue = Math.min(...sparklineData);

  return (
    <div onClick={onClick} className="cursor-pointer">
      <GlassCard className="p-4 hover-elevate transition-all group">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="font-bold text-foreground text-lg">{assetId}</div>
            <div className="text-sm text-muted-foreground">{inefficiencyDriver}</div>
          </div>
          <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor()}`}>
            {severity}
          </div>
        </div>

        {/* Expected Savings */}
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          <span className="text-sm text-muted-foreground">Expected Savings:</span>
          <span className="font-bold text-primary">{filterState.currency} {expectedSavings.toLocaleString()}</span>
        </div>

        {/* Trend and Sparkline */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {trend > 0 ? (
              <TrendingUp className="w-4 h-4 text-destructive" />
            ) : (
              <TrendingDown className="w-4 h-4 text-primary" />
            )}
            <span className={`text-sm font-medium ${trend > 0 ? "text-destructive" : "text-primary"}`}>
              {trend > 0 ? "+" : ""}{trend}%
            </span>
          </div>
          
          {/* Mini Sparkline */}
          <div className="flex-1 max-w-20 h-6 ml-3">
            <svg width="100%" height="100%" viewBox="0 0 60 24" className="overflow-visible">
              <polyline
                fill="none"
                stroke={trend > 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                strokeWidth="1.5"
                points={sparklineData
                  .map((value, index) => {
                    const x = (index / (sparklineData.length - 1)) * 60;
                    const y = 24 - ((value - minValue) / (maxValue - minValue)) * 24;
                    return `${x},${y}`;
                  })
                  .join(" ")
                }
                className="opacity-70"
              />
            </svg>
          </div>
        </div>
      </div>
    </GlassCard>
    </div>
  );
}