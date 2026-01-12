import { PredictiveAlert } from '../PredictiveAlert';

export default function PredictiveAlertExample() {
  // todo: remove mock data - predictive alert
  const mockAlert = {
    id: "1",
    title: "Potential Fuel System Issue",
    detail: "Vehicle ABC-123 showing irregular consumption patterns. Possible fuel system degradation.",
    confidence: 87,
    type: "maintenance" as const,
    actionRequired: true
  };

  const handleDeploySensor = () => {
    console.log('Deploy sensor triggered');
  };

  const handleInvestigate = (alert: any) => {
    console.log('Investigating alert:', alert.title);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
      {/* With alert */}
      <PredictiveAlert 
        alert={mockAlert}
        onDeploySensor={handleDeploySensor}
        onInvestigate={handleInvestigate}
      />
      
      {/* No alert */}
      <PredictiveAlert 
        onDeploySensor={handleDeploySensor}
        onInvestigate={handleInvestigate}
      />
    </div>
  );
}