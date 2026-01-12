import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "./GlassCard";
import { Truck, TrendingUp, TrendingDown } from "lucide-react";

interface Asset {
  id: string;
  plate: string;
  name: string;
  costPerKm: number;
  severity: "High" | "Medium" | "Low";
  trend: number; // percentage change
  fuelLevel?: number;
  status: "active" | "idle" | "maintenance";
}

interface AssetListProps {
  assets: Asset[];
  onAssetClick: (asset: Asset) => void;
  title?: string;
}

export function AssetList({ assets, onAssetClick, title = "Top Inefficient Assets" }: AssetListProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "High":
        return "text-destructive";
      case "Medium":
        return "text-chart-3";
      case "Low":
        return "text-chart-2";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-chart-2";
      case "idle":
        return "bg-chart-3";
      case "maintenance":
        return "bg-destructive";
      default:
        return "bg-muted";
    }
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <Badge variant="outline" className="text-xs">
          Ranked
        </Badge>
      </div>

      {assets.length === 0 ? (
        <div className="text-center py-8">
          <Truck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No assets to display</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-auto">
          {assets.map((asset, index) => (
            <Button
              key={asset.id}
              variant="ghost"
              className="w-full h-auto p-3 justify-start hover-elevate"
              onClick={() => onAssetClick(asset)}
              data-testid={`asset-${asset.id}`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  {/* Rank indicator */}
                  <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </div>
                  
                  {/* Vehicle plate */}
                  <div className="w-12 h-12 rounded-lg bg-card/50 border border-border/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-foreground">
                      {asset.plate.split('-')[0]}
                    </span>
                  </div>
                  
                  {/* Vehicle info */}
                  <div className="text-left">
                    <div className="text-sm font-medium text-foreground">
                      {asset.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {asset.plate} • Cost/km: ${asset.costPerKm.toFixed(2)}
                    </div>
                    {asset.fuelLevel !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        Fuel: {asset.fuelLevel}%
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  {/* Status indicator */}
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(asset.status)}`} />
                  
                  {/* Severity */}
                  <div className={`text-sm font-semibold ${getSeverityColor(asset.severity)}`}>
                    {asset.severity}
                  </div>
                  
                  {/* Trend */}
                  <div className={`flex items-center text-xs ${
                    asset.trend > 0 ? "text-destructive" : "text-chart-2"
                  }`}>
                    {asset.trend > 0 ? (
                      <TrendingUp className="w-3 h-3 mr-1" />
                    ) : (
                      <TrendingDown className="w-3 h-3 mr-1" />
                    )}
                    {Math.abs(asset.trend)}%
                  </div>
                </div>
              </div>
            </Button>
          ))}
        </div>
      )}

      <div className="mt-4 text-xs text-muted-foreground text-center">
        Click an asset to view detailed summary
      </div>
    </GlassCard>
  );
}