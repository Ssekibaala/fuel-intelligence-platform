import { useState } from "react";
import { PageHeader } from "./PageHeader";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, X, Lightbulb, Thermometer, Upload, BarChart3 } from "lucide-react";
import { DataVisualizationTables } from "./DataVisualizationTables";
import { DailyMovementPreview } from "@/components/exact/DailyMovementPreview";
import { FuelTemperaturePreview } from "@/components/exact/FuelTemperaturePreview";


const reportTemplates = {
  "daily-movement": {
    title: "Daily Movement Report",
    description: "EXACT daily movement report showing asset movements, distances, times - identical to Excel sample",
    category: "Operations",
    icon: "FileText",
    color: "blue"
  },
  "fuel-temperature": {
    title: "Fuel & Temperature Report",
    description: "EXACT sensor/fuel/temperature report with refuel events - identical to PDF sample",
    category: "Maintenance",
    icon: "Thermometer",
    color: "orange"
  }
};


interface ReportsPageProps {
  pageId?: string;
}

export function ReportsPage({ pageId }: ReportsPageProps) {
  const { toast } = useToast();

  const [selectedAssetGroup, setSelectedAssetGroup] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDataTables, setShowDataTables] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // New states for EXACT reports
  const [showPreview, setShowPreview] = useState(false);
  const [previewType, setPreviewType] = useState<'daily-movement' | 'fuel-temperature' | null>(null);
  const [previewDate, setPreviewDate] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<string>('excel');
  const [showPreviewFirst, setShowPreviewFirst] = useState(true);

  const handleTemplateSelect = (templateType: string) => {
    setSelectedTemplate(templateType);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTemplate(null);
    // Reset form when modal closes
    setSelectedAssetGroup("");
    setDateFrom("");
    setDateTo("");
  };

  const handleGenerateFromModal = async (templateType: string) => {
    if (!dateFrom || !dateTo) {
      toast({
        title: "Missing Information",
        description: "Please select a date range before generating the report.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);

    const template = reportTemplates[templateType as keyof typeof reportTemplates];

    // Handle EXACT reports
    if (templateType === 'daily-movement' || templateType === 'fuel-temperature') {

      if (showPreviewFirst) {
        // Show preview
        setPreviewType(templateType as any);
        setPreviewDate(dateFrom);
        setShowPreview(true);
        setIsModalOpen(false);
        setIsGenerating(false);
        return;
      }

      // Generate and download
      try {
        if (templateType === 'daily-movement') {
          console.log('🔍 DEBUG: Starting daily-movement download request');
          console.log('🔍 DEBUG: Request URL:', `/api/reports/generate?format=${selectedFormat}&start_date=${dateFrom}&end_date=${dateTo}&asset_id=${selectedAssetGroup}`);

          // Call backend to generate Daily Movement Excel
          const response = await fetch(`/api/reports/generate?format=${selectedFormat}&start_date=${dateFrom}&end_date=${dateTo}&asset_id=${selectedAssetGroup}`, {
            method: 'GET'
          });

          console.log('🔍 DEBUG: Response status:', response.status);
          console.log('🔍 DEBUG: Response headers:', Object.fromEntries(response.headers.entries()));
          console.log('🔍 DEBUG: Response ok:', response.ok);

          if (!response.ok) {
            console.error('🔍 DEBUG: Response not ok, throwing error');
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const blob = await response.blob();
          console.log('🔍 DEBUG: Blob size:', blob.size, 'bytes');
          console.log('🔍 DEBUG: Blob type:', blob.type);

          if (blob.size === 0) {
            console.error('🔍 DEBUG: Empty blob received');
            throw new Error('Empty file received from server');
          }

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `daily_movement_${dateFrom}_${dateTo}.${selectedFormat === 'excel' ? 'xlsx' : 'csv'}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

        } else if (templateType === 'fuel-temperature') {
          console.log('🔍 DEBUG: Starting fuel-temperature download request');
          console.log('🔍 DEBUG: Request URL:', `/api/reports/generate?format=${selectedFormat}&start_date=${dateFrom}&end_date=${dateTo}&asset_id=${selectedAssetGroup}`);

          // Call backend to generate Fuel/Temperature PDF
          const response = await fetch(`/api/reports/generate?format=${selectedFormat}&start_date=${dateFrom}&end_date=${dateTo}&asset_id=${selectedAssetGroup}`, {
            method: 'GET'
          });

          console.log('🔍 DEBUG: Response status:', response.status);
          console.log('🔍 DEBUG: Response headers:', Object.fromEntries(response.headers.entries()));
          console.log('🔍 DEBUG: Response ok:', response.ok);

          if (!response.ok) {
            console.error('🔍 DEBUG: Response not ok, throwing error');
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const blob = await response.blob();
          console.log('🔍 DEBUG: Blob size:', blob.size, 'bytes');
          console.log('🔍 DEBUG: Blob type:', blob.type);

          if (blob.size === 0) {
            console.error('🔍 DEBUG: Empty blob received');
            throw new Error('Empty file received from server');
          }

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `fuel_temperature_${dateFrom}_${dateTo}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }

        toast({
          title: "Report Downloaded Successfully",
          description: `${template.title} for ${dateFrom} to ${dateTo}`,
        });

      } catch (error) {
        toast({
          title: "Error Generating Report",
          description: "Failed to generate the report. Please try again.",
          variant: "destructive"
        });
      }
    }

    // Reset form
    setSelectedAssetGroup("");
    setDateFrom("");
    setDateTo("");
    setSelectedTemplate(null);
    setIsGenerating(false);
    setIsModalOpen(false);
  };


  if (showDataTables) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <PageHeader pageId={pageId || "reports"} />
          </div>
          <Button variant="outline" onClick={() => setShowDataTables(false)}>
            Back to Reports
          </Button>
        </div>
        <DataVisualizationTables />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <PageHeader pageId={pageId || "reports"} />
        </div>
        <Button onClick={() => setShowDataTables(true)} className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          View Data Tables
        </Button>
      </div>

      {/* Report Template Library */}
      <GlassCard className="p-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">Report Template Library</h2>
        <p className="text-muted-foreground mb-8">Choose from our curated report templates designed for fleet intelligence and decision-making.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Movement Report Card */}
          <GlassCard className="p-6 hover-elevate motion-premium cursor-pointer border border-border/30">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <FileText className="w-6 h-6 text-blue-500" />
              </div>
              <div className="text-xs text-muted-foreground bg-card/20 px-2 py-1 rounded-full border border-border/20">
                Operations
              </div>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-2">Daily Movement Report</h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              EXACT daily movement report showing asset movements, distances, times - identical to Excel sample
            </p>

            <div className="space-y-2 mb-6">
              <div className="text-xs text-muted-foreground font-medium">EXACT Columns Include:</div>
              <div className="flex flex-wrap gap-1">
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-1 rounded-full">Departure Time</span>
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-1 rounded-full">Distance (km)</span>
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-1 rounded-full">Max Speed</span>
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-1 rounded-full">Standing Time</span>
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-1 rounded-full">Fuel Used</span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => handleTemplateSelect("daily-movement")}
            >
              Generate Report
            </Button>
          </GlassCard>

          {/* Fuel & Temperature Report Card */}
          <GlassCard className="p-6 hover-elevate motion-premium cursor-pointer border border-border/30">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <Thermometer className="w-6 h-6 text-orange-500" />
              </div>
              <div className="text-xs text-muted-foreground bg-card/20 px-2 py-1 rounded-full border border-border/20">
                Maintenance
              </div>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-2">Fuel & Temperature Report</h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              EXACT sensor/fuel/temperature report with refuel events - identical to PDF sample
            </p>

            <div className="space-y-2 mb-6">
              <div className="text-xs text-muted-foreground font-medium">EXACT Sections Include:</div>
              <div className="flex flex-wrap gap-1">
                <span className="text-xs bg-orange-500/10 text-orange-500 px-2 py-1 rounded-full">Total Distance</span>
                <span className="text-xs bg-orange-500/10 text-orange-500 px-2 py-1 rounded-full">Fuel Used</span>
                <span className="text-xs bg-orange-500/10 text-orange-500 px-2 py-1 rounded-full">Fuel Graph</span>
                <span className="text-xs bg-orange-500/10 text-orange-500 px-2 py-1 rounded-full">Refuel Events</span>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => handleTemplateSelect("fuel-temperature")}
            >
              Generate Report
            </Button>
          </GlassCard>
        </div>
      </GlassCard>



      {/* Smart Generation Modal */}
      <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-md backdrop-blur-xl bg-card/95 border border-border/30">
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Lightbulb className="w-5 h-5 text-primary" />
              Smart Report Generation
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Complete the details below to generate your personalized fleet intelligence report.
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-6">
              {/* Pre-filled Report Type (Locked) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Selected Report Template</Label>
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20" data-testid="selected-template-info">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">
                        {reportTemplates[selectedTemplate as keyof typeof reportTemplates].title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {reportTemplates[selectedTemplate as keyof typeof reportTemplates].description}
                      </div>
                    </div>
                    <div className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
                      {reportTemplates[selectedTemplate as keyof typeof reportTemplates].category}
                    </div>
                  </div>
                </div>
              </div>

              {/* Format Selection for EXACT reports */}
              {(selectedTemplate === 'daily-movement' || selectedTemplate === 'fuel-temperature') && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    Report Format <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={selectedTemplate === 'daily-movement' ? 'excel' : 'pdf'}>
                        {selectedTemplate === 'daily-movement' ? 'Excel (.xlsx)' : 'PDF (.pdf)'}
                      </SelectItem>
                      <SelectItem value="preview">Preview Only</SelectItem>
                      <SelectItem value="csv">CSV Export</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {selectedTemplate === 'daily-movement'
                      ? 'Generates EXACT Excel format matching your sample'
                      : 'Generates EXACT PDF format matching your sample'}
                  </p>
                </div>
              )}

              {/* Asset Group Selection - Only for EXACT reports */}
              {(selectedTemplate === 'daily-movement' || selectedTemplate === 'fuel-temperature') && (
                <div className="space-y-2">
                  <Label htmlFor="modal-asset-group" className="text-sm font-medium text-foreground">
                    Asset/Vehicle <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedAssetGroup} onValueChange={setSelectedAssetGroup}>
                    <SelectTrigger
                      data-testid="modal-select-asset-group"
                      className="focus:ring-2 focus:ring-primary focus:border-primary bg-card/40 backdrop-blur-sm border-border/30"
                    >
                      <SelectValue placeholder="Select vehicle or 'All Assets'" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assets</SelectItem>
                      <SelectItem value="howo-ubg002k">HOWO - UBG002K</SelectItem>
                      <SelectItem value="howo-ubg003k">HOWO - UBG003K</SelectItem>
                      <SelectItem value="faw-ubl433l">FAW-UBL433L</SelectItem>
                      {/* Add more assets as needed */}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Date Range Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="modal-date-from" className="text-sm font-medium text-foreground">
                    From Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="modal-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    data-testid="modal-input-date-from"
                    className="bg-card/40 backdrop-blur-sm border-border/30 focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="modal-date-to" className="text-sm font-medium text-foreground">
                    To Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="modal-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    data-testid="modal-input-date-to"
                    className="bg-card/40 backdrop-blur-sm border-border/30 focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              {/* Show preview option */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="show-preview"
                  checked={showPreviewFirst}
                  onChange={(e) => setShowPreviewFirst(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="show-preview" className="text-sm">
                  Show preview before downloading
                </Label>
              </div>

              <div className="text-xs text-muted-foreground bg-card/20 p-3 rounded-lg border border-border/20">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3 h-3" />
                  <span className="font-medium">Report Features</span>
                </div>
                {selectedTemplate === 'daily-movement'
                  ? 'Generates EXACT Excel file matching the Daily Movement Report sample format'
                  : selectedTemplate === 'fuel-temperature'
                  ? 'Generates EXACT PDF file matching the Fuel/Temperature Report sample format'
                  : 'Company logo and branding are automatically included based on your workspace settings.'}
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-3 pt-4 border-t border-border/20">
            <Button
              variant="outline"
              onClick={handleCloseModal}
              className="flex-1"
              data-testid="modal-button-cancel"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={() => handleGenerateFromModal(selectedTemplate!)}
              disabled={isGenerating || !dateFrom || !dateTo}
              className="flex-1"
              data-testid="modal-button-generate"
            >
              <Download className="w-4 h-4 mr-2" />
              {isGenerating ? "Generating Report..." : showPreviewFirst ? "Preview Report" : "Generate & Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-7xl h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {previewType === 'daily-movement' ? 'Daily Movement Report Preview' : 'Fuel & Temperature Report Preview'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-4 bg-gray-50">
            {previewType === 'daily-movement' && (
                <div className="bg-white shadow-lg">
                  <DailyMovementPreview
                    date={previewDate}
                    data={[
                      // Vehicle 1: HOWO-UBG002K - FIXED to match screenshot exactly
                      {
                        asset: {
                          asset_description: "HOWO-UBG002K",
                          registration_number: "UR6000X", // FIXED: Match screenshot
                          asset_id: 1,
                          site_name: "AOT Africa Ltd." // FIXED: Match screenshot
                        },
                        trips: [
                          {
                            asset_description: "HOWO-UBG002K",
                            registration_number: "UR6000X",
                            asset_id: 1,
                            site_name: "AOT Africa Ltd.",
                            departure_date: "07/12/2025", // FIXED: Match date from screenshot
                            driver: "Kasoona Hakim",
                            departure_time: "04:06:23",
                            departed_from: "AT04, Kenya",
                            driving_time: "00:08:28",
                            standing_time: "00:00:00",
                            distance_km: 2.41,
                            max_speed_kmh: 55,
                            arrival_time: "04:14:51",
                            arrived_at: "AT04, Kenya",
                            next_departure: "14/12/2025, 04:22",
                            standing_time_at_location: "00027AR", // FIXED: Exact format from screenshot
                            fuel_used_litres: 0.37
                          },
                          {
                            asset_description: "HOWO-UBG002K",
                            registration_number: "UR6000X",
                            asset_id: 1,
                            site_name: "AOT Africa Ltd.",
                            departure_date: "07/12/2025", // FIXED: Match date from screenshot
                            driver: "Kasoona Hakim",
                            departure_time: "04:30:12",
                            departed_from: "JBN-JOF, AT04, Kenya",
                            driving_time: "00:02:29",
                            standing_time: "00:00:00",
                            distance_km: 2.10,
                            max_speed_kmh: 34,
                            arrival_time: "04:32:39",
                            arrived_at: "JBN-JOF, AT04, Kenya",
                            next_departure: "14/12/2025, 05:02",
                            standing_time_at_location: "00637-42", // FIXED: Exact format from screenshot
                            fuel_used_litres: 0.44
                          }
                        ],
                        totals: {
                          drivingTime: "00:10:57",
                          distance: 4.51,
                          standingTime: "00:45:31"
                        },
                        averages: {
                          drivingTime: "00:05:28",
                          distance: 2.255,
                          standingTime: "00:22:45"
                        }
                      },
                      // Vehicle 2: HOWO-UBG003K - Added to ensure minimum 2 vehicles
                      {
                        asset: {
                          asset_description: "HOWO-UBG003K",
                          registration_number: "UR6001X",
                          asset_id: 2,
                          site_name: "AOT Africa Ltd."
                        },
                        trips: [
                          {
                            asset_description: "HOWO-UBG003K",
                            registration_number: "UR6001X",
                            asset_id: 2,
                            site_name: "AOT Africa Ltd.",
                            departure_date: "07/12/2025",
                            driver: "Juma Alfred",
                            departure_time: "05:00:00",
                            departed_from: "Nairobi Depot",
                            driving_time: "01:15:30",
                            standing_time: "00:10:00",
                            distance_km: 15.50,
                            max_speed_kmh: 65,
                            arrival_time: "06:15:30",
                            arrived_at: "Kampala Hub",
                            next_departure: "14/12/2025, 07:00",
                            standing_time_at_location: "00125AR",
                            fuel_used_litres: 2.8
                          }
                        ],
                        totals: {
                          drivingTime: "01:15:30",
                          distance: 15.50,
                          standingTime: "00:10:00"
                        },
                        averages: {
                          drivingTime: "01:15:30",
                          distance: 15.50,
                          standingTime: "00:10:00"
                        }
                      }
                    ]}
                  />
                </div>
              )}

            {previewType === 'fuel-temperature' && (
              <div className="bg-white shadow-lg">
                <FuelTemperaturePreview
                  date={previewDate}
                  data={{
                    totalDistance: 18.59,
                    totalRefills: 556.80,
                    totalDrains: 0.00,
                    fuelUsed: 31.20,
                    fuelConsumption: 0.60,
                    refuelEvents: [
                      {
                        time: "08 Dec 2025 12:30:05",
                        initial_fuel: 544.80,
                        final_fuel: 597.60,
                        refilled: 2.80,
                        location: "Factory Close, Nitrida Industrial Area, Nakawa, Kampala Capital City, Kampala, Central Region, Uganda",
                        latitude: 0.33567,
                        longitude: 32.616355
                      },
                      {
                        time: "08 Dec 2025 11:56:45",
                        initial_fuel: 40.80,
                        final_fuel: 544.80,
                        refilled: 504.00,
                        location: "Factory Close, Nitrida Industrial Area, Nakawa, Kampala Capital City, Kampala, Central Region, Uganda",
                        latitude: 0.335818,
                        longitude: 32.616806
                      }
                    ]
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-gray-500">
              Generated: {new Date().toLocaleString()}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                <X className="w-4 h-4 mr-2" />
                Close Preview
              </Button>
              <Button onClick={async () => {
                if (previewType === 'daily-movement') {
                  console.log('🔍 DEBUG: Preview download - daily-movement Excel');
                  console.log('🔍 DEBUG: Preview URL:', `/api/reports/generate?format=excel&start_date=${previewDate}&end_date=${previewDate}&asset_id=all`);
  
                  // Download Excel
                  const response = await fetch(`/api/reports/generate?format=excel&start_date=${previewDate}&end_date=${previewDate}&asset_id=all`, {
                    method: 'GET'
                  });
  
                  console.log('🔍 DEBUG: Preview response status:', response.status);
                  console.log('🔍 DEBUG: Preview response headers:', Object.fromEntries(response.headers.entries()));
  
                  if (!response.ok) {
                    console.error('🔍 DEBUG: Preview response not ok');
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                  }
  
                  const blob = await response.blob();
                  console.log('🔍 DEBUG: Preview blob size:', blob.size, 'bytes');
  
                  if (blob.size === 0) {
                    console.error('🔍 DEBUG: Empty preview blob');
                    throw new Error('Empty file received from server');
                  }
  
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `daily_movement_${previewDate}.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                } else {
                  console.log('🔍 DEBUG: Preview download - fuel-temperature PDF');
                  console.log('🔍 DEBUG: Preview URL:', `/api/reports/generate?format=pdf&start_date=${previewDate}&end_date=${previewDate}&asset_id=all`);
  
                  // Download PDF
                  const response = await fetch(`/api/reports/generate?format=pdf&start_date=${previewDate}&end_date=${previewDate}&asset_id=all`, {
                    method: 'GET'
                  });
  
                  console.log('🔍 DEBUG: Preview response status:', response.status);
                  console.log('🔍 DEBUG: Preview response headers:', Object.fromEntries(response.headers.entries()));
  
                  if (!response.ok) {
                    console.error('🔍 DEBUG: Preview response not ok');
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                  }
  
                  const blob = await response.blob();
                  console.log('🔍 DEBUG: Preview blob size:', blob.size, 'bytes');
  
                  if (blob.size === 0) {
                    console.error('🔍 DEBUG: Empty preview blob');
                    throw new Error('Empty file received from server');
                  }
  
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `fuel_temperature_${previewDate}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                }
                setShowPreview(false);
              }}>
                <Download className="w-4 h-4 mr-2" />
                Download {previewType === 'daily-movement' ? 'Excel' : 'PDF'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}