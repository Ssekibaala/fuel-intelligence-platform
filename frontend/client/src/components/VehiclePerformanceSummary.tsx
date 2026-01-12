import React from "react";
import { GlassCard } from "./GlassCard";

interface VehiclePerformanceSummaryProps {
  distance: string;
  currentFuel: string;
  fuelUsed: string;
  consumption: string;
  drainsVolume: string;
  drainsCount: number;
  refillsVolume: string;
  refillsCount: number;
}

export function VehiclePerformanceSummary({
  distance,
  currentFuel,
  fuelUsed,
  consumption,
  drainsVolume,
  drainsCount,
  refillsVolume,
  refillsCount,
}: VehiclePerformanceSummaryProps) {
  return (
    <div className="w-full mb-6">
      <GlassCard className="p-6 card-surface-premium hover-elevate motion-premium">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
          {/* Distance Tile */}
          <div className="text-center p-4 rounded-lg bg-card/10 border border-border/20 hover-elevate transition-all shadow-sm" data-testid="tile-distance">
            <div className="text-lg font-bold text-primary mb-1" data-testid="distance-value">
              {distance}
            </div>
            <div className="text-xs text-muted-foreground">Distance</div>
          </div>

          {/* Current Fuel Tile */}
          <div className="text-center p-4 rounded-lg bg-card/10 border border-border/20 hover-elevate transition-all shadow-sm" data-testid="tile-current-fuel">
            <div className="text-lg font-bold text-primary mb-1" data-testid="current-fuel-value">
              {currentFuel}
            </div>
            <div className="text-xs text-muted-foreground">Current fuel</div>
          </div>

          {/* Fuel Used Tile */}
          <div className="text-center p-4 rounded-lg bg-card/10 border border-border/20 hover-elevate transition-all shadow-sm" data-testid="tile-fuel-used">
            <div className="text-lg font-bold text-foreground mb-1" data-testid="fuel-used-value">
              {fuelUsed}
            </div>
            <div className="text-xs text-muted-foreground">Fuel used</div>
          </div>

          {/* Consumption Tile */}
          <div className="text-center p-4 rounded-lg bg-card/10 border border-border/20 hover-elevate transition-all shadow-sm" data-testid="tile-consumption">
            <div className="text-lg font-bold text-foreground mb-1" data-testid="consumption-value">
              {consumption}
            </div>
            <div className="text-xs text-muted-foreground">Consumption</div>
          </div>

          {/* Drains Tile */}
          <div className="text-center p-4 rounded-lg bg-card/10 border border-border/20 hover-elevate transition-all shadow-sm" data-testid="tile-drains">
            <div className="text-lg font-bold text-destructive mb-1" data-testid="drains-volume">
              {drainsVolume}
            </div>
            <div className="text-xs text-muted-foreground">{drainsCount} Drains</div>
          </div>

          {/* Refills Tile */}
          <div className="text-center p-4 rounded-lg bg-card/10 border border-border/20 hover-elevate transition-all shadow-sm" data-testid="tile-refills">
            <div className="text-lg font-bold text-primary mb-1" data-testid="refills-volume">
              {refillsVolume}
            </div>
            <div className="text-xs text-muted-foreground">{refillsCount} Refills</div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}