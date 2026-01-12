import { AssetList } from '../AssetList';

export default function AssetListExample() {
  // todo: remove mock data - assets
  const mockAssets = [
    {
      id: "1",
      plate: "ABC-123",
      name: "Delivery Truck A1",
      costPerKm: 0.85,
      severity: "High" as const,
      trend: 12,
      fuelLevel: 65,
      status: "active" as const
    },
    {
      id: "2",
      plate: "XYZ-789",
      name: "Service Van B2",
      costPerKm: 0.72,
      severity: "Medium" as const,
      trend: -5,
      fuelLevel: 40,
      status: "idle" as const
    },
    {
      id: "3",
      plate: "DEF-456",
      name: "Logistics Truck C3",
      costPerKm: 0.91,
      severity: "High" as const,
      trend: 8,
      fuelLevel: 20,
      status: "maintenance" as const
    }
  ];

  const handleAssetClick = (asset: any) => {
    console.log('Asset clicked:', asset.name);
  };

  return (
    <div className="max-w-md">
      <AssetList 
        assets={mockAssets}
        onAssetClick={handleAssetClick}
      />
    </div>
  );
}