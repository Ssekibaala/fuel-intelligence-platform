import { GlassCard } from "./GlassCard";

interface FuelOrbProps {
  percentage: number;
  estimatedTime?: string;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
}

export function FuelOrb({ percentage, estimatedTime = "N/A", size = "md", animated = true }: FuelOrbProps) {
  const sizeClasses = {
    sm: "w-24 h-24",
    md: "w-32 h-32",
    lg: "w-40 h-40"
  };

  const strokeWidths = {
    sm: 6,
    md: 8,
    lg: 10
  };

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  const getFuelColor = () => {
    if (percentage > 60) return "#10b981"; // green
    if (percentage > 30) return "#f59e0b"; // amber
    return "#ef4444"; // red
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg 
          viewBox="0 0 120 120" 
          className={`${sizeClasses[size]} ${animated ? 'animate-pulse-glow' : ''}`}
        >
          <defs>
            <linearGradient id="fuelGradient" x1="0" x2="1">
              <stop offset="0" stopColor={getFuelColor()} stopOpacity="0.8" />
              <stop offset="1" stopColor={getFuelColor()} stopOpacity="0.3" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/> 
              </feMerge>
            </filter>
          </defs>
          
          {/* Background circle */}
          <circle 
            cx="60" 
            cy="60" 
            r={radius}
            stroke="rgba(255,255,255,0.1)" 
            strokeWidth={strokeWidths[size]}
            fill="transparent"
          />
          
          {/* Progress circle */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke="url(#fuelGradient)"
            strokeWidth={strokeWidths[size] - 2}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            fill="transparent"
            className={`transition-all duration-1000 ease-out ${animated ? 'filter-[url(#glow)]' : ''}`}
            transform="rotate(-90 60 60)"
          />
          
          {/* Center dot */}
          <circle 
            cx="60" 
            cy="60" 
            r="8" 
            fill={getFuelColor()}
            className={animated ? "animate-pulse" : ""}
          />
          
          {/* Percentage text */}
          <text 
            x="60" 
            y="70" 
            textAnchor="middle" 
            className="text-sm fill-foreground font-bold"
          >
            {percentage}%
          </text>
        </svg>
        
        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
          <div className="text-xs text-muted-foreground text-center">
            Fuel Level
          </div>
        </div>
      </div>

      {estimatedTime !== "N/A" && (
        <div className="mt-4 text-center">
          <div className="text-xs text-muted-foreground">Est. time to empty</div>
          <div className="text-sm font-semibold text-foreground">{estimatedTime}</div>
        </div>
      )}
    </div>
  );
}