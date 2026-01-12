import { useState, useEffect } from "react";
import { useGlobalFilter } from "./GlobalFilterContext";

interface CountUpAnimationProps {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  trigger?: boolean; // External trigger for re-animation
}

export function CountUpAnimation({ 
  value, 
  duration = 2000, 
  decimals = 0, 
  suffix = "", 
  className = "",
  trigger = false 
}: CountUpAnimationProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsAnimating(true);
    let startTime: number;
    let animationFrameId: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = value * easeOut;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [value, duration, trigger]); // Re-run when trigger changes

  const formatValue = (val: number) => {
    return val.toFixed(decimals);
  };

  return (
    <span 
      className={`${className} ${isAnimating ? 'animate-pulse-subtle' : ''}`}
      data-testid="count-up-value"
    >
      {formatValue(displayValue).toLocaleString()}{suffix}
    </span>
  );
}

// Specialized versions for common use cases
export function CountUpCurrency({ 
  value, 
  currency, 
  duration = 2000, 
  className = "",
  trigger = false 
}: {
  value: number;
  currency?: string;
  duration?: number;
  className?: string;
  trigger?: boolean;
}) {
  const { state: filterState } = useGlobalFilter();
  const displayCurrency = currency || filterState.currency;
  
  return (
    <CountUpAnimation
      value={value}
      duration={duration}
      decimals={0}
      suffix={` ${displayCurrency}`}
      className={className}
      trigger={trigger}
    />
  );
}

export function CountUpPercentage({ 
  value, 
  duration = 2000, 
  className = "",
  trigger = false 
}: {
  value: number;
  duration?: number;
  className?: string;
  trigger?: boolean;
}) {
  return (
    <CountUpAnimation
      value={value}
      duration={duration}
      decimals={1}
      suffix="%"
      className={className}
      trigger={trigger}
    />
  );
}