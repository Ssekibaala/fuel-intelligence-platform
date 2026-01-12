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
import { Settings, DollarSign, Gauge, Palette, Upload, Save } from "lucide-react";
import { useGlobalFilter } from "./GlobalFilterContext";

interface SettingsData {
  fuelCostPerLiter: number;
  defaultCurrency: string;
  excellentThreshold: number;
  acceptableThreshold: number;
  theftAlertThreshold: number;
  companyLogo: string | null;
  defaultTheme: string;
  defaultLandingPage: string;
  enableNotifications: boolean;
  enableEmailReports: boolean;
}

interface SettingsPageProps {
  pageId?: string;
}

export function SettingsPage({ pageId }: SettingsPageProps) {
  const { toast } = useToast();
  const { state: filterState, actions } = useGlobalFilter();
  
  const [settings, setSettings] = useState<SettingsData>({
    fuelCostPerLiter: filterState.fuelCostPerLiter,
    defaultCurrency: filterState.currency,
    excellentThreshold: 8.0,
    acceptableThreshold: 12.0,
    theftAlertThreshold: 15.0,
    companyLogo: null,
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
    if (file) {
      // In a real app, you'd upload to a server
      const reader = new FileReader();
      reader.onload = (e) => {
        setSettings(prev => ({
          ...prev,
          companyLogo: e.target?.result as string
        }));
      };
      reader.readAsDataURL(file);
      
      toast({
        title: "Logo uploaded",
        description: "Company logo has been updated and will appear in reports.",
      });
    }
  };

  const updateSetting = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <PageHeader pageId={pageId || "settings"} />
        </div>
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
        <GlassCard className="p-6">
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
        <GlassCard className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            Efficiency Thresholds
          </h2>
          
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">
                  Excellent Efficiency (L/100km)
                </Label>
                <div className="px-3">
                  <Slider
                    value={[settings.excellentThreshold]}
                    onValueChange={(value) => updateSetting('excellentThreshold', value[0])}
                    max={15}
                    min={5}
                    step={0.5}
                    className="w-full"
                    data-testid="slider-excellent-threshold"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5.0</span>
                  <span className="font-medium text-primary">Current: {settings.excellentThreshold.toFixed(1)}</span>
                  <span>15.0</span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">
                  Acceptable Efficiency (L/100km)
                </Label>
                <div className="px-3">
                  <Slider
                    value={[settings.acceptableThreshold]}
                    onValueChange={(value) => updateSetting('acceptableThreshold', value[0])}
                    max={20}
                    min={8}
                    step={0.5}
                    className="w-full"
                    data-testid="slider-acceptable-threshold"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>8.0</span>
                  <span className="font-medium text-accent-foreground">Current: {settings.acceptableThreshold.toFixed(1)}</span>
                  <span>20.0</span>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">
                  Theft Alert Threshold (L/100km)
                </Label>
                <div className="px-3">
                  <Slider
                    value={[settings.theftAlertThreshold]}
                    onValueChange={(value) => updateSetting('theftAlertThreshold', value[0])}
                    max={25}
                    min={12}
                    step={0.5}
                    className="w-full"
                    data-testid="slider-theft-threshold"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>12.0</span>
                  <span className="font-medium text-destructive">Current: {settings.theftAlertThreshold.toFixed(1)}</span>
                  <span>25.0</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-accent/5 border border-accent/20 rounded-lg">
              <div className="text-sm text-accent-foreground dark:text-accent-foreground font-medium mb-2">Threshold Impact</div>
              <div className="text-xs text-muted-foreground">
                Assets consuming above {settings.theftAlertThreshold.toFixed(1)} L/100km will trigger theft alerts. Between {settings.excellentThreshold.toFixed(1)}-{settings.acceptableThreshold.toFixed(1)} L/100km is considered normal operation.
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Branding & Defaults */}
        <GlassCard className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Branding & Defaults
          </h2>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-foreground">Company Logo</Label>
              <div className="flex items-center gap-4">
                {settings.companyLogo && (
                  <div className="w-16 h-16 border border-border/30 rounded-lg overflow-hidden bg-card/20">
                    <img 
                      src={settings.companyLogo} 
                      alt="Company Logo" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Used in generated reports and PDFs
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
        <GlassCard className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-6">System Information</h2>
          
          <div className="space-y-4">
            <div className="flex justify-between py-2 border-b border-border/20">
              <span className="text-sm text-muted-foreground">Application Version</span>
              <span className="text-sm font-medium text-foreground">Fleet Sentinel v2.1.4</span>
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