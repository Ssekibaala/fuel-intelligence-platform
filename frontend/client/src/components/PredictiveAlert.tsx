import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "./GlassCard";
import { AlertTriangle, Brain } from "lucide-react";

interface PredictiveAlertData {
  id: string;
  title: string;
  detail: string;
  confidence: number;
  type: "maintenance" | "theft" | "efficiency" | "breakdown";
  actionRequired: boolean;
}

interface PredictiveAlertProps {
  alert?: PredictiveAlertData;
  onDeploySensor: () => void;
  onInvestigate: (alert: PredictiveAlertData) => void;
}

export function PredictiveAlert({ alert, onDeploySensor, onInvestigate }: PredictiveAlertProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-destructive";
    if (confidence >= 60) return "text-chart-3";
    return "text-chart-2";
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case "maintenance":
        return "🔧";
      case "theft":
        return "🚨";
      case "efficiency":
        return "⚡";
      case "breakdown":
        return "⚠️";
      default:
        return "ℹ️";
    }
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Predictive Alerts</h3>
        </div>
        <Badge variant="outline" className="text-xs">
          AI confidence
        </Badge>
      </div>

      {alert ? (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-border/30 bg-card/20">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-start gap-2">
                <span className="text-lg" role="img" aria-label={alert.type}>
                  {getAlertTypeIcon(alert.type)}
                </span>
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    {alert.title}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {alert.detail}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <div className={`text-sm font-bold ${getConfidenceColor(alert.confidence)}`}>
                  {alert.confidence}%
                </div>
                <div className="text-xs text-muted-foreground">confidence</div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button 
                size="sm" 
                onClick={onDeploySensor}
                className="text-xs h-7 px-3"
                data-testid="button-deploy-sensor"
              >
                Deploy Sensor
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onInvestigate(alert)}
                className="text-xs h-7 px-3 hover-elevate"
                data-testid="button-investigate-alert"
              >
                Investigate
              </Button>
            </div>

            {alert.actionRequired && (
              <div className="mt-3 flex items-center gap-2 text-xs text-chart-3">
                <AlertTriangle className="w-3 h-3" />
                <span>Immediate attention required</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No predictive issues detected.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            AI monitoring is active
          </p>
        </div>
      )}
    </GlassCard>
  );
}