import { Dashboard } from '../Dashboard';
import { ThemeProvider } from '../ThemeProvider';

export default function DashboardExample() {
  return (
    <ThemeProvider>
      <div className="bg-background min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground mb-6">Teletrac Fuel</h1>
          <Dashboard selectedVehicle="" />
        </div>
      </div>
    </ThemeProvider>
  );
}

