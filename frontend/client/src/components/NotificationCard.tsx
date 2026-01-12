import { Button } from "@/components/ui/button";
import { GlassCard } from "./GlassCard";
import { Badge } from "@/components/ui/badge";

interface Notification {
  id: string;
  type: "theft" | "refill" | "maintenance" | "alert";
  title: string;
  message: string;
  time: string;
  severity?: "low" | "medium" | "high";
}

interface NotificationCardProps {
  notifications: Notification[];
  onInvestigate: (notification: Notification) => void;
}

export function NotificationCard({ notifications, onInvestigate }: NotificationCardProps) {
  const getNotificationIcon = (type: string) => {
    const icons = {
      theft: "T",
      refill: "R",
      maintenance: "M",
      alert: "A"
    };
    return icons[type as keyof typeof icons] || "N";
  };

  const getNotificationColor = (type: string) => {
    const colors = {
      theft: "bg-destructive text-destructive-foreground",
      refill: "bg-chart-2 text-white",
      maintenance: "bg-chart-3 text-white",
      alert: "bg-chart-1 text-white"
    };
    return colors[type as keyof typeof colors] || "bg-muted text-muted-foreground";
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Fuel Notifications</h3>
        <Badge variant="outline" className="text-xs">
          Live
        </Badge>
      </div>

      <div className="space-y-3 max-h-64 overflow-auto">
        {notifications.length === 0 ? (
          <p className="text-muted-foreground text-sm">No recent notifications</p>
        ) : (
          notifications.map((notification) => (
            <div key={notification.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/20 transition-colors">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${getNotificationColor(notification.type)}`}>
                {getNotificationIcon(notification.type)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="text-sm font-medium text-foreground truncate">
                    {notification.title}
                  </h4>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {notification.time}
                  </span>
                </div>
                
                <p className="text-xs text-muted-foreground mb-2">
                  {notification.message}
                </p>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onInvestigate(notification)}
                  className="text-xs h-7 px-3 hover-elevate"
                  data-testid={`button-investigate-${notification.id}`}
                >
                  Investigate
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}