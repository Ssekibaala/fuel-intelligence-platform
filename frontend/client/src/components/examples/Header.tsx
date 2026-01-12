import { useState } from "react";
import { Header } from '../Header';
import { ThemeProvider } from '../ThemeProvider';

export default function HeaderExample() {
  const [selectedVehicle, setSelectedVehicle] = useState("");

  const handleRefresh = () => {
    console.log('Refresh triggered');
  };

  return (
    <ThemeProvider>
      <div className="bg-background min-h-32">
        <Header 
          selectedVehicle={selectedVehicle} 
          onVehicleChange={setSelectedVehicle}
          onRefresh={handleRefresh}
        />
        <div className="p-4">
          <p className="text-muted-foreground">Header component with vehicle selection and theme toggle</p>
        </div>
      </div>
    </ThemeProvider>
  );
}