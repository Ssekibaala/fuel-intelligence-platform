import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "./PageHeader";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterControls } from "./FilterControls";
import { useGlobalFilter } from "./GlobalFilterContext";
import { api, globalFilterToApiParams } from "../lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Bell,
  Droplet,
  Eye,
  MoreHorizontal,
  Info
} from "lucide-react";

interface Alert {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  type: "theft" | "refill";
  asset: string;
  timestamp: string;
  status: "active" | "acknowledged" | "resolved";
  aiConfidence?: number;
}

interface AlertsPageProps {
  pageId?: string;
}

export function AlertsPage({ pageId }: AlertsPageProps) {
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const { state: filterState } = useGlobalFilter();
  const refreshIntervalMs = filterState.refreshInterval > 0 ? filterState.refreshInterval : false;

  const filterParams = globalFilterToApiParams(filterState);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["/api/vehicles", filterState.selectedClientId, filterState.selectedVehicles],
    queryFn: () =>
      api.getVehicles({
        clientId: filterState.selectedClientId !== "all" ? filterState.selectedClientId : undefined,
      }),
    staleTime: 30 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  const { data: fuelEvents = [] } = useQuery({
    queryKey: ["/api/fuel-events", filterState.selectedClientId, filterState.selectedVehicles, filterState.dateRange],
    queryFn: () => api.getFuelEvents(filterParams),
    staleTime: 10 * 1000,
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
  });

  const vehicleLabelById = useMemo(() => {
    return new Map(
      vehicles.map((vehicle: any) => [
        vehicle.id,
        vehicle.vehiclePlate || vehicle.assetId || vehicle.driverName || `Vehicle ${String(vehicle.id).slice(0, 8)}`,
      ])
    );
  }, [vehicles]);

  const formatRelativeTime = (value?: string | Date | null) => {
    if (!value) return "Unknown time";
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return "Unknown time";
    const diffMs = Date.now() - time;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

  const alerts: Alert[] = useMemo(() => {
    return fuelEvents
      .filter((event: any) => event.eventType === "refill" || event.eventType === "theft" || event.eventType === "leak")
      .map((event: any) => {
        const isTheft = event.eventType === "theft" || event.eventType === "leak";
        const volume = Math.abs(Number(event.volumeLiters || 0));
        const assetLabel = vehicleLabelById.get(event.vehicleId) || "Unknown Asset";
        const eventTime = event.eventTimestamp ? new Date(event.eventTimestamp).getTime() : 0;
        const isRecent = eventTime ? Date.now() - eventTime < 6 * 60 * 60 * 1000 : false;

        const baseStatus: Alert["status"] = isTheft ? (isRecent ? "active" : "acknowledged") : "resolved";
        return {
          id: event.id,
          title: isTheft ? "Fuel Theft Detected" : "Fuel Refill Logged",
          description: isTheft
            ? `Unexpected fuel drain of ${volume.toFixed(1)} L at ${event.location || "unknown location"}.`
            : `Refill of ${volume.toFixed(1)} L at ${event.location || "unknown location"}.`,
          severity: isTheft ? (volume >= 30 ? "critical" : "high") : "low",
          type: isTheft ? "theft" : "refill",
          asset: assetLabel,
          timestamp: formatRelativeTime(event.eventTimestamp),
          status: acknowledgedIds.has(event.id) ? "acknowledged" : baseStatus,
        };
      });
  }, [fuelEvents, vehicleLabelById, acknowledgedIds]);

  const summary = useMemo(() => {
    const theftEvents = fuelEvents.filter((event: any) => event.eventType === "theft" || event.eventType === "leak");
    const refillEvents = fuelEvents.filter((event: any) => event.eventType === "refill");
    const theftVolume = theftEvents.reduce((sum: number, event: any) => sum + Math.abs(Number(event.volumeLiters || 0)), 0);
    const refillVolume = refillEvents.reduce((sum: number, event: any) => sum + Math.abs(Number(event.volumeLiters || 0)), 0);
    return {
      activeAlerts: alerts.filter((a) => a.status === "active").length,
      theftCount: theftEvents.length,
      theftVolume,
      refillCount: refillEvents.length,
      refillVolume,
    };
  }, [alerts, fuelEvents]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-destructive bg-destructive/20 border-destructive/30";
      case "high": return "text-warning bg-warning/20 border-warning/30";
      case "medium": return "text-accent-foreground bg-accent/20 border-accent/30";
      case "low": return "text-primary bg-primary/20 border-primary/30";
      default: return "text-muted-foreground bg-muted/20 border-border";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "theft": return <Shield className="w-4 h-4" />;
      case "refill": return <Droplet className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active": return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case "acknowledged": return <Clock className="w-4 h-4 text-accent-foreground" />;
      case "resolved": return <CheckCircle className="w-4 h-4 text-primary" />;
      default: return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    if (selectedSeverity !== "all" && alert.severity !== selectedSeverity) return false;
    if (selectedType !== "all" && alert.type !== selectedType) return false;
    if (selectedStatus !== "all" && alert.status !== selectedStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Alert Command Center Header */}
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <PageHeader pageId={pageId || "alerts"} className="mb-0 md:hidden" />
        <FilterControls compact />
      </div>

      {/* Alert Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="w-3 h-3" />
          <span>Filter:</span>
        </div>
        <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
          <SelectTrigger className="h-8 w-32 text-xs bg-card/40 backdrop-blur-sm border-border/30">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="h-8 w-28 text-xs bg-card/40 backdrop-blur-sm border-border/30">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="theft">Theft</SelectItem>
            <SelectItem value="refill">Refill</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="h-8 w-32 text-xs bg-card/40 backdrop-blur-sm border-border/30">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        {(selectedSeverity !== "all" || selectedType !== "all" || selectedStatus !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setSelectedSeverity("all"); setSelectedType("all"); setSelectedStatus("all"); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Alerts Overview */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <GlassCard className="p-3 hover-elevate transition-all">
          <div className="mb-2 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-red-500/20 p-1.5">
                <Bell className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">Active Alerts</div>
                <div className="text-[11px] text-muted-foreground">Requires attention</div>
              </div>
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold leading-none text-red-400">{summary.activeAlerts}</div>
            <div className="text-xs text-muted-foreground">Theft alerts in focus</div>
          </div>
        </GlassCard>

        <GlassCard className="p-3 hover-elevate transition-all">
          <div className="mb-2 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/20 p-1.5">
                <Droplet className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">Refills</div>
                <div className="text-[11px] text-muted-foreground">Detected in range</div>
              </div>
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold leading-none text-primary">{summary.refillCount}</div>
            <div className="text-xs text-muted-foreground">{summary.refillVolume.toFixed(1)} L total</div>
          </div>
        </GlassCard>

        <GlassCard className="p-3 hover-elevate transition-all">
          <div className="mb-2 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-destructive/20 p-1.5">
                <Shield className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">Thefts</div>
                <div className="text-[11px] text-muted-foreground">Detected in range</div>
              </div>
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold leading-none text-destructive">{summary.theftCount}</div>
            <div className="text-xs text-muted-foreground">{summary.theftVolume.toFixed(1)} L total</div>
          </div>
        </GlassCard>
      </div>

      {/* Alert Management Section */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary" />
              Alert History & Management
            </h3>
          </div>

          {/* Alert List */}
          {filteredAlerts.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/40 p-8 text-center text-sm text-muted-foreground">
              No theft or refill alerts found for the selected filters.
            </div>
          )}
          <div className="space-y-4">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className="p-4 rounded-lg border border-border/30 bg-card/10 hover-elevate transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    {/* Alert Icon & Type */}
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                        {getTypeIcon(alert.type)}
                      </div>
                    </div>

                    {/* Alert Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold text-foreground">{alert.title}</h4>
                        <Badge
                          variant="outline"
                          className={`text-xs ${getSeverityColor(alert.severity)}`}
                        >
                          {alert.severity.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {alert.asset}
                        </Badge>
                        {alert.aiConfidence && (
                          <Badge variant="outline" className="text-xs bg-accent/10 text-accent-foreground border-accent/20">
                            AI: {alert.aiConfidence}%
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground mb-3">{alert.description}</p>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{alert.timestamp}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(alert.status)}
                          <span className="capitalize">{alert.status}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          toast({
                            title: `Investigating: ${alert.title}`,
                            description: `Asset: ${alert.asset} · ${alert.description}`,
                          })
                        }
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Investigate
                      </Button>
                      {alert.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            setAcknowledgedIds((prev) => new Set([...prev, alert.id]));
                            toast({
                              title: "Alert Acknowledged",
                              description: `${alert.title} for ${alert.asset} has been acknowledged.`,
                            });
                          }}
                        >
                          Acknowledge
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Footer */}
          <div className="mt-6 pt-4 border-t border-border/30">
            <div className="flex justify-between items-center text-sm">
              <div className="text-muted-foreground">
                Showing {filteredAlerts.length} of {alerts.length} alerts
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-muted-foreground">Active: {alerts.filter(a => a.status === "active").length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-muted-foreground">Acknowledged: {alerts.filter(a => a.status === "acknowledged").length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-muted-foreground">Resolved: {alerts.filter(a => a.status === "resolved").length}</span>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
