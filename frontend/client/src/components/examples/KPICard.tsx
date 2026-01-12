import { KPICard } from '../KPICard';
import { Truck, Fuel, DollarSign } from 'lucide-react';

export default function KPICardExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
      <KPICard
        title="Total Assets"
        value={42}
        subtitle="Active now: 38"
        badge="Uptime"
        badgeVariant="success"
        icon={<Truck className="w-4 h-4" />}
        trend={{ value: 5, direction: "up" }}
        onClick={() => console.log('Total assets clicked')}
      />
      <KPICard
        title="Avg Consumption"
        value="8.5 L/100km"
        subtitle="Engine hours: 1,247h"
        icon={<Fuel className="w-4 h-4" />}
        trend={{ value: 2, direction: "down" }}
      />
      <KPICard
        title="Total Fuel Cost YTD"
        value="$12,847"
        subtitle="Cost per L: $1.25"
        badge="Proactive"
        badgeVariant="info"
        icon={<DollarSign className="w-4 h-4" />}
      />
    </div>
  );
}