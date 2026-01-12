import { useState } from "react";
import { PageHeader } from "./PageHeader";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterControls } from "./FilterControls";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Search,
  Bell,
  Settings,
  Activity,
  Zap,
  TrendingUp,
  Eye,
  MoreHorizontal,
  AlertCircle,
  Info
} from "lucide-react";

interface Alert {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  type: "theft" | "maintenance" | "efficiency" | "system" | "route";
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

  // Mock alerts data - Apple/Tesla inspired alert management
  const alerts: Alert[] = [
    {
      id: "alert-001",
      title: "Potential Fuel Theft Detected",
      description: "Vehicle SEM-12346 showing rapid fuel level decrease during parking. Pattern matches known theft signatures.",
      severity: "critical",
      type: "theft",
      asset: "SEM-12346",
      timestamp: "2 minutes ago",
      status: "active",
      aiConfidence: 94
    },
    {
      id: "alert-002",
      title: "Maintenance Required",
      description: "Vehicle KCF-234M fuel system efficiency degraded by 18%. Preventive maintenance recommended.",
      severity: "high",
      type: "maintenance",
      asset: "KCF-234M",
      timestamp: "15 minutes ago",
      status: "acknowledged",
      aiConfidence: 87
    },
    {
      id: "alert-003",
      title: "Route Optimization Available",
      description: "NAR-567B daily route can be optimized to save 12% fuel consumption. AI suggests alternate path.",
      severity: "medium",
      type: "efficiency",
      asset: "NAR-567B",
      timestamp: "1 hour ago",
      status: "active",
      aiConfidence: 91
    },
    {
      id: "alert-004",
      title: "System Sensor Offline",
      description: "Fuel sensor on vehicle DEF-789 lost connectivity. Last reading 3 hours ago.",
      severity: "high",
      type: "system",
      asset: "DEF-789",
      timestamp: "3 hours ago",
      status: "active",
      aiConfidence: 99
    },
    {
      id: "alert-005",
      title: "Unauthorized Route Deviation",
      description: "Vehicle ABC-123 deviated from planned route by 15km. Driver did not report route change.",
      severity: "medium",
      type: "route",
      asset: "ABC-123",
      timestamp: "6 hours ago",
      status: "resolved",
      aiConfidence: 82
    }
  ];

  const systemStatus = {
    overallHealth: 98.7,
    activeSensors: 47,
    totalSensors: 48,
    activeAlerts: alerts.filter(a => a.status === "active").length,
    resolvedToday: 12,
    aiEngineStatus: "optimal",
    dataProcessingLatency: "< 2ms"
  };

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
      case "maintenance": return <Settings className="w-4 h-4" />;
      case "efficiency": return <TrendingUp className="w-4 h-4" />;
      case "system": return <Activity className="w-4 h-4" />;
      case "route": return <AlertCircle className="w-4 h-4" />;
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
      <div className="flex items-center justify-between">
        <div>
          <PageHeader pageId={pageId || "alerts"} />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>
      </div>

      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* System Health */}
        <GlassCard className="p-6 hover-elevate transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">System Health</div>
                <div className="text-sm text-muted-foreground">Overall Status</div>
              </div>
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-1">{systemStatus.overallHealth}%</div>
            <div className="text-sm text-muted-foreground">Operational Excellence</div>
          </div>
        </GlassCard>

        {/* Active Alerts */}
        <GlassCard className="p-6 hover-elevate transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <Bell className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">Active Alerts</div>
                <div className="text-sm text-muted-foreground">Requires Attention</div>
              </div>
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-400 mb-1">{systemStatus.activeAlerts}</div>
            <div className="text-sm text-muted-foreground">Critical Actions Needed</div>
          </div>
        </GlassCard>

        {/* Sensor Network */}
        <GlassCard className="p-6 hover-elevate transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Activity className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">Sensor Network</div>
                <div className="text-sm text-muted-foreground">Connected Devices</div>
              </div>
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400 mb-1">{systemStatus.activeSensors}/{systemStatus.totalSensors}</div>
            <div className="text-sm text-muted-foreground">Online Sensors</div>
          </div>
        </GlassCard>

        {/* AI Engine */}
        <GlassCard className="p-6 hover-elevate transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/20 rounded-lg">
                <Zap className="w-6 h-6 text-accent-foreground" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">AI Engine</div>
                <div className="text-sm text-muted-foreground">Processing Status</div>
              </div>
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-accent-foreground mb-1 capitalize">{systemStatus.aiEngineStatus}</div>
            <div className="text-sm text-muted-foreground">Processing: {systemStatus.dataProcessingLatency}</div>
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

            {/* Dynamic Filter Controls */}
            <FilterControls />
          </div>

          {/* Alert List */}
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
                      <Button variant="outline" size="sm" className="h-8">
                        <Eye className="w-3 h-3 mr-1" />
                        Investigate
                      </Button>
                      {alert.status === "active" && (
                        <Button variant="outline" size="sm" className="h-8">
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