import { useState } from "react";
import { PageHeader } from "./PageHeader";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Gauge, Palette, Upload, Save, X } from "lucide-react";
import { useGlobalFilter } from "./GlobalFilterContext";
import teletracLogo from "@/assets/teletrac-logo.png";
import { getStoredBrandLogo, setStoredBrandLogo } from "@/lib/branding";

interface SettingsData {
  fuelCostPerLiter: number;
  defaultCurrency: string;
  consumptionUnit: "KM/L" | "HRS/L";
  consumptionExcellentThreshold: number;
  consumptionAcceptableThreshold: number;
  consumptionAlertThreshold: number;
  companyLogo: string | null;
  defaultTheme: string;
  defaultLandingPage: string;
  enableNotifications: boolean;
  enableEmailReports: boolean;
}

interface SettingsPageProps {
  pageId?: string;
}

const getConsumptionThresholdConfig = (unit: "KM/L" | "HRS/L") =>
  unit === "KM/L"
    ? {
      unitLabel: "Km/L",
      min: 0.5,
      maxExcellent: 10,
      maxAcceptable: 8,
      maxAlert: 6,
      step: 0.1,
      hint: "Higher is better. More distance per liter means better consumption."
    }
    : {
      unitLabel: "Hrs/L",
      min: 0.05,
      maxExcellent: 2,
      maxAcceptable: 1.5,
      maxAlert: 1,
      step: 0.01,
      hint: "Higher is better. More working hours per liter means better consumption."
    };

export function SettingsPage({ pageId }: SettingsPageProps) {
  const { toast } = useToast();
  const { state: filterState, actions } = useGlobalFilter();
  
  const [settings, setSettings] = useState<SettingsData>({
    fuelCostPerLiter: filterState.fuelCostPerLiter,
    defaultCurrency: filterState.currency,
    consumptionUnit: filterState.consumptionUnit,
    consumptionExcellentThreshold: filterState.consumptionExcellentThreshold,
    consumptionAcceptableThreshold: filterState.consumptionAcceptableThreshold,
    consumptionAlertThreshold: filterState.consumptionAlertThreshold,
    companyLogo: getStoredBrandLogo(),
    defaultTheme: "dark",
    defaultLandingPage: "dashboard",
    enableNotifications: true,
    enableEmailReports: false
  });

  const [isSaving, setIsSaving] = useState(false);

  const currencies = [
    { value: "KES", label: "KES (Kenyan Shilling)" },
    { value: "UGX", label: "UGX (Ugandan Shilling)" },
    { value: "USD", label: "USD (US Dollar)" }
  ];

  const themes = [
    { value: "dark", label: "Dark Mode" },
    { value: "light", label: "Light Mode" },
    { value: "system", label: "System Default" }
  ];

  const landingPages = [
    { value: "dashboard", label: "Dashboard" },
    { value: "assets", label: "Fleet Assets" },
    { value: "alerts", label: "Alerts" }
  ];

  const handleSaveSettings = async () => {
    setIsSaving(true);
    
    // Update global settings
    actions.setCurrency(settings.defaultCurrency as "KES" | "UGX" | "USD");
    actions.setFuelCostPerLiter(settings.fuelCostPerLiter);
    actions.setConsumptionUnit(settings.consumptionUnit);
    actions.setConsumptionThresholds({
      excellent: settings.consumptionExcellentThreshold,
      acceptable: settings.consumptionAcceptableThreshold,
      alert: settings.consumptionAlertThreshold
    });
    
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: "Settings saved successfully",
        description: "All configuration changes have been applied to the system.",
      });
    }, 1500);
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Invalid file",
        description: "Please upload an image file.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const nextLogo = (e.target?.result as string) || null;
      setSettings((prev) => ({
        ...prev,
        companyLogo: nextLogo,
      }));
      setStoredBrandLogo(nextLogo);
      toast({
        title: "Logo uploaded",
        description: "Logo updated. It now appears in page headings across the app.",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = () => {
    setSettings((prev) => ({
      ...prev,
      companyLogo: null,
    }));
    setStoredBrandLogo(null);
    toast({
      title: "Logo reset",
      description: "Default Teletrac logo restored in page headings.",
    });
  };

  const updateSetting = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    if (key === "consumptionUnit") {
      const nextUnit = value as SettingsData["consumptionUnit"];
      const config = getConsumptionThresholdConfig(nextUnit);

      setSettings((prev) => {
        const excellent = Math.min(Math.max(prev.consumptionExcellentThreshold, config.min), config.maxExcellent);
        const acceptableMax = Math.min(config.maxAcceptable, excellent);
        const acceptable = Math.min(Math.max(prev.consumptionAcceptableThreshold, config.min), acceptableMax);
        const alertMax = Math.min(config.maxAlert, acceptable);
        const alert = Math.min(Math.max(prev.consumptionAlertThreshold, config.min), alertMax);

        return {
          ...prev,
          consumptionUnit: nextUnit,
          consumptionExcellentThreshold: excellent,
          consumptionAcceptableThreshold: acceptable,
          consumptionAlertThreshold: alert,
        };
      });
      return;
    }

    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const updateConsumptionThreshold = (
    key: "consumptionExcellentThreshold" | "consumptionAcceptableThreshold" | "consumptionAlertThreshold",
    value: number
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };

      if (next.consumptionExcellentThreshold < next.consumptionAcceptableThreshold) {
        next.consumptionAcceptableThreshold = next.consumptionExcellentThreshold;
      }

      if (next.consumptionAcceptableThreshold < next.consumptionAlertThreshold) {
        next.consumptionAlertThreshold = next.consumptionAcceptableThreshold;
      }

      return next;
    });
  };

  const thresholdConfig = getConsumptionThresholdConfig(settings.consumptionUnit);

  const currentHeadingLogo = settings.companyLogo || teletracLogo;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <PageHeader pageId={pageId || "settings"} className="mb-0" />
        <Button 
          onClick={handleSaveSettings} 
          disabled={isSaving}
          className="flex items-center gap-2"
          data-testid="button-save-settings"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Saving..." : "Save All Changes"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-8">
        {/* Financial Parameters */}
        <GlassCard className="p-6" hover={false}>
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Financial Parameters
          </h2>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="fuel-cost" className="text-sm font-medium text-foreground">
                Current Fuel Cost per Liter
              </Label>
              <div className="flex items-center gap-2">
                <Select value={settings.defaultCurrency} onValueChange={(value) => updateSetting('defaultCurrency', value)}>
                  <SelectTrigger className="w-24" data-testid="select-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((currency) => (
                      <SelectItem key={currency.value} value={currency.value}>
                        {currency.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="fuel-cost"
                  type="number"
                  value={settings.fuelCostPerLiter}
                  onChange={(e) => updateSetting('fuelCostPerLiter', parseFloat(e.target.value) || 0)}
                  step="0.01"
                  className="flex-1"
                  data-testid="input-fuel-cost"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This value affects all cost calculations throughout the application
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Default Currency</Label>
              <Select value={settings.defaultCurrency} onValueChange={(value) => updateSetting('defaultCurrency', value)}>
                <SelectTrigger data-testid="select-default-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.value} value={currency.value}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used for all financial displays and reports
              </p>
            </div>

            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="text-sm text-primary font-medium mb-2">Financial Impact Preview</div>
              <div className="text-xs text-muted-foreground">
                Current rate: {settings.defaultCurrency} {settings.fuelCostPerLiter.toFixed(2)}/L will be applied to all cost metrics across the dashboard and reports.
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Threshold Preferences */}
        <GlassCard className="p-6" hover={false}>
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            Consumption Thresholds
          </h2>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Consumption Unit</Label>
              <Select
                value={settings.consumptionUnit}
                onValueChange={(value) => updateSetting("consumptionUnit", value as "KM/L" | "HRS/L")}
              >
                <SelectTrigger data-testid="select-consumption-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KM/L">Km/L</SelectItem>
                  <SelectItem value="HRS/L">Hrs/L</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{thresholdConfig.hint}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">
                  Excellent Consumption ({thresholdConfig.unitLabel})
                </Label>
                <div className="px-3">
                  <Slider
                    value={[settings.consumptionExcellentThreshold]}
                    onValueChange={(value) => updateConsumptionThreshold('consumptionExcellentThreshold', value[0])}
                    max={thresholdConfig.maxExcellent}
                    min={thresholdConfig.min}
                    step={thresholdConfig.step}
                    className="w-full"
                    data-testid="slider-excellent-threshold"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{thresholdConfig.min.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)}</span>
                  <span className="font-medium text-primary">
                    Current: {settings.consumptionExcellentThreshold.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)}
                  </span>
                  <span>{thresholdConfig.maxExcellent.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">
                  Acceptable Consumption ({thresholdConfig.unitLabel})
                </Label>
                <div className="px-3">
                  <Slider
                    value={[settings.consumptionAcceptableThreshold]}
                    onValueChange={(value) => updateConsumptionThreshold('consumptionAcceptableThreshold', value[0])}
                    max={thresholdConfig.maxAcceptable}
                    min={thresholdConfig.min}
                    step={thresholdConfig.step}
                    className="w-full"
                    data-testid="slider-acceptable-threshold"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{thresholdConfig.min.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)}</span>
                  <span className="font-medium text-accent-foreground">
                    Current: {settings.consumptionAcceptableThreshold.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)}
                  </span>
                  <span>{thresholdConfig.maxAcceptable.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">
                  Alert Threshold ({thresholdConfig.unitLabel})
                </Label>
                <div className="px-3">
                  <Slider
                    value={[settings.consumptionAlertThreshold]}
                    onValueChange={(value) => updateConsumptionThreshold('consumptionAlertThreshold', value[0])}
                    max={thresholdConfig.maxAlert}
                    min={thresholdConfig.min}
                    step={thresholdConfig.step}
                    className="w-full"
                    data-testid="slider-theft-threshold"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{thresholdConfig.min.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)}</span>
                  <span className="font-medium text-destructive">
                    Current: {settings.consumptionAlertThreshold.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)}
                  </span>
                  <span>{thresholdConfig.maxAlert.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-accent/5 border border-accent/20 rounded-lg">
              <div className="text-sm text-accent-foreground dark:text-accent-foreground font-medium mb-2">Threshold Impact</div>
              <div className="text-xs text-muted-foreground">
                Assets below {settings.consumptionAlertThreshold.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)} {thresholdConfig.unitLabel} are flagged for alerting.
                Between {settings.consumptionAcceptableThreshold.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)} and {settings.consumptionExcellentThreshold.toFixed(settings.consumptionUnit === "KM/L" ? 1 : 2)} {thresholdConfig.unitLabel} is normal.
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Branding & Defaults */}
        <GlassCard className="p-6" hover={false}>
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Branding & Defaults
          </h2>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground">Page Heading Logo</Label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-40 border border-border/30 rounded-lg overflow-hidden bg-white p-2">
                  <img
                    src={currentHeadingLogo}
                    alt="Page heading logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                    data-testid="input-logo-upload"
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => document.getElementById('logo-upload')?.click()}
                    className="flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Logo
                  </Button>
                  {settings.companyLogo && (
                    <Button
                      variant="ghost"
                      onClick={handleResetLogo}
                      className="ml-2"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Reset
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload your brand logo here. It will appear in the page heading on each page.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground">Default Theme</Label>
              <Select value={settings.defaultTheme} onValueChange={(value) => updateSetting('defaultTheme', value)}>
                <SelectTrigger data-testid="select-default-theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {themes.map((theme) => (
                    <SelectItem key={theme.value} value={theme.value}>
                      {theme.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground">Default Landing Page</Label>
              <Select value={settings.defaultLandingPage} onValueChange={(value) => updateSetting('defaultLandingPage', value)}>
                <SelectTrigger data-testid="select-default-landing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {landingPages.map((page) => (
                    <SelectItem key={page.value} value={page.value}>
                      {page.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-foreground">Push Notifications</Label>
                  <p className="text-xs text-muted-foreground">Receive alerts for critical events</p>
                </div>
                <Switch
                  checked={settings.enableNotifications}
                  onCheckedChange={(checked) => updateSetting('enableNotifications', checked)}
                  data-testid="switch-notifications"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-foreground">Email Reports</Label>
                  <p className="text-xs text-muted-foreground">Daily summary reports via email</p>
                </div>
                <Switch
                  checked={settings.enableEmailReports}
                  onCheckedChange={(checked) => updateSetting('enableEmailReports', checked)}
                  data-testid="switch-email-reports"
                />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* System Information */}
        <GlassCard className="p-6" hover={false}>
          <h2 className="text-xl font-bold text-foreground mb-6">System Information</h2>
          
          <div className="space-y-4">
            <div className="flex justify-between py-2 border-b border-border/20">
              <span className="text-sm text-muted-foreground">Application Version</span>
              <span className="text-sm font-medium text-foreground">Teletrac Fuel v2.1.4</span>
            </div>
            
            <div className="flex justify-between py-2 border-b border-border/20">
              <span className="text-sm text-muted-foreground">Last System Update</span>
              <span className="text-sm font-medium text-foreground">September 25, 2024</span>
            </div>
            
            <div className="flex justify-between py-2 border-b border-border/20">
              <span className="text-sm text-muted-foreground">Database Status</span>
              <span className="text-sm font-medium text-primary">Connected</span>
            </div>
            
            <div className="flex justify-between py-2 border-b border-border/20">
              <span className="text-sm text-muted-foreground">API Health</span>
              <span className="text-sm font-medium text-primary">All Services Online</span>
            </div>

            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">Support Contact</span>
              <span className="text-sm font-medium text-primary">support@fleet-sentinel.com</span>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

