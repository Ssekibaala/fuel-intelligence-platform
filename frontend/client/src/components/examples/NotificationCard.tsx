import { NotificationCard } from '../NotificationCard';

export default function NotificationCardExample() {
  // todo: remove mock data - notifications
  const mockNotifications = [
    {
      id: "1",
      type: "theft" as const,
      title: "Potential Fuel Theft Detected",
      message: "Vehicle ABC-123 shows unusual fuel level drop during parking",
      time: "2 min ago",
      severity: "high" as const
    },
    {
      id: "2",
      type: "refill" as const,
      title: "Fuel Refill Completed",
      message: "Vehicle XYZ-789 refueled 45L at Central Station",
      time: "15 min ago",
      severity: "low" as const
    },
    {
      id: "3",
      type: "alert" as const,
      title: "Route Deviation Alert",
      message: "Vehicle DEF-456 deviated from planned route",
      time: "1 hour ago",
      severity: "medium" as const
    }
  ];

  const handleInvestigate = (notification: any) => {
    console.log('Investigating notification:', notification.title);
  };

  return (
    <div className="max-w-lg">
      <NotificationCard 
        notifications={mockNotifications}
        onInvestigate={handleInvestigate}
      />
    </div>
  );
}