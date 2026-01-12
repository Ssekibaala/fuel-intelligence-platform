import { FuelOrb } from '../FuelOrb';

export default function FuelOrbExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6">
      <div className="text-center">
        <h4 className="mb-4 text-sm font-medium text-foreground">High Fuel (85%)</h4>
        <FuelOrb percentage={85} estimatedTime="4h 32min" size="sm" />
      </div>
      
      <div className="text-center">
        <h4 className="mb-4 text-sm font-medium text-foreground">Medium Fuel (45%)</h4>
        <FuelOrb percentage={45} estimatedTime="2h 15min" size="md" />
      </div>
      
      <div className="text-center">
        <h4 className="mb-4 text-sm font-medium text-foreground">Low Fuel (15%)</h4>
        <FuelOrb percentage={15} estimatedTime="35min" size="lg" />
      </div>
    </div>
  );
}