interface CircularGaugeProps {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  subtitle?: string;
  confidence?: number;
  showConfidence?: boolean;
}

export function CircularGauge({ 
  value, 
  max = 100, 
  size = "lg", 
  label,
  subtitle,
  confidence,
  showConfidence = false
}: CircularGaugeProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const strokeWidth = 8;
  const radius = size === "xl" ? 90 : size === "lg" ? 70 : size === "md" ? 50 : 35;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  // Determine color based on value
  const getColor = () => {
    if (percentage >= 85) return "hsl(var(--primary))"; // Green
    if (percentage >= 70) return "hsl(var(--warning))"; // Warning
    return "hsl(var(--destructive))"; // Red
  };

  const getStatus = () => {
    if (percentage >= 85) return "Excellent";
    if (percentage >= 70) return "Good";
    return "Needs Attention";
  };

  const svgSize = (radius + strokeWidth) * 2;

  return (
    <div className="flex flex-col items-center justify-center space-y-3">
      <div className="relative">
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            stroke="hsl(var(--border))"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="opacity-20"
          />
          
          {/* Progress circle */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            stroke={getColor()}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
            style={{
              filter: "drop-shadow(0 0 6px currentColor)",
            }}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`font-bold text-foreground ${
            size === "xl" ? "text-4xl" : size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-xl"
          }`}>
            {Math.round(value)}
          </div>
          <div className={`text-muted-foreground font-medium ${
            size === "xl" ? "text-base" : size === "lg" ? "text-sm" : "text-xs"
          }`}>
            {getStatus()}
          </div>
        </div>
      </div>
      
      {label && (
        <div className="text-center">
          <div className="font-semibold text-foreground text-lg">{label}</div>
          {subtitle && (
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          )}
        </div>
      )}
      
      {showConfidence && confidence && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card/40 px-3 py-1 rounded-full border border-border/30">
          <div className="w-2 h-2 bg-primary rounded-full"></div>
          <span>Confidence Index: {confidence.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}