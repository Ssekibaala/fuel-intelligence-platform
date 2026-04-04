import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useReducer,
  useState,
} from "react";
import { PageHeader } from "./PageHeader";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Download,
  X,
  Lightbulb,
  Thermometer,
  BarChart3,
  Loader2,
  Pencil,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DataVisualizationTables } from "./DataVisualizationTables";
import { DateRangePicker } from "./DateRangePicker";
import { DailyMovementPreview } from "@/components/exact/DailyMovementPreview";
import { FuelTemperaturePreview } from "@/components/exact/FuelTemperaturePreview";
import { getAuthToken } from "@/lib/authToken";
import { config } from "@/lib/config";
import { useAuth } from "@/components/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { type DateRange, type Vehicle } from "@shared/schema";
import { formatDateTimeEAT } from "@/lib/dateTime";
import { saveBlobToFile } from "@/lib/fileSave";
import { exportPreviewSnapshot } from "@/lib/reportPreviewExport";

/* ---------------------------------- Types --------------------------------- */

type VehicleScope = "all" | "single" | "group";
type Step = "scope" | "date" | "review";
type DatePreset = "today" | "last7" | "last30" | "custom";

type TemplateKey = "daily-movement" | "fuel-temperature";
type FormatValue = "pdf" | "excel" | "csv" | "preview";
type DownloadFormat = "pdf" | "excel" | "csv";

type ReportTemplate = {
  title: string;
  description: string;
  category: "Operations" | "Maintenance";
  icon: "FileText" | "Thermometer";
  color: "blue" | "orange";
};

type AdminClient = { id: string; name: string };

type PreviewResponse = {
  generatedOn?: string;
  companyName?: string;
  reportDate?: string;
  reports?: unknown[]; // daily movement
  totalDistance?: number; // fuel
  totalRefills?: number;
  totalDrains?: number;
  fuelUsed?: number;
  fuelConsumption?: number;
  refuelEvents?: unknown[];
  [k: string]: unknown;
};

interface ReportsPageProps {
  pageId?: string;
}

/* -------------------------------- Constants -------------------------------- */

const STEP_ORDER: Step[] = ["scope", "date", "review"];
const FLOW_ORDER: Step[] = ["scope", "date", "review"];

const REPORT_TEMPLATES: Record<TemplateKey, ReportTemplate> = {
  "daily-movement": {
    title: "Daily Movement Report",
    description:
      "Operational movement story with asset-by-asset travel, dwell time, speed, and fuel coverage",
    category: "Operations",
    icon: "FileText",
    color: "blue",
  },
  "fuel-temperature": {
    title: "Fuel & Temperature Report",
    description:
      "EXACT sensor/fuel/temperature report with refuel events - identical to PDF sample",
    category: "Maintenance",
    icon: "Thermometer",
    color: "orange",
  },
};

const WIZARD_STORAGE_KEY = "reports_wizard_v1";

const REPORT_DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
] as const;

/* --------------------------------- Helpers -------------------------------- */

function getVehicleLabel(vehicle: Vehicle) {
  if (vehicle.vehiclePlate) return vehicle.vehiclePlate;
  if (vehicle.assetId) return vehicle.assetId;
  if (vehicle.driverName) return vehicle.driverName;
  return `Vehicle ${String(vehicle.id).slice(0, 8)}`;
}

function toDateInputValue(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function fromDateInputValue(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isValidDateRange(dateFrom: string, dateTo: string) {
  if (!dateFrom || !dateTo) return false;
  return new Date(dateFrom) <= new Date(dateTo);
}

function getBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");
}

function getAuthHeaders() {
  const headers: Record<string, string> = {};
  const authToken = getAuthToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

function resolveDownloadFormat(
  templateType: TemplateKey,
  selectedFormat: FormatValue,
  csvOnlyExport: boolean = false
): DownloadFormat {
  if (csvOnlyExport) return "csv";
  if (templateType === "daily-movement") {
    if (selectedFormat === "csv") return "csv";
    if (selectedFormat === "excel") return "excel";
    return "pdf";
  }
  if (selectedFormat === "csv") return "csv";
  if (selectedFormat === "excel") return "excel";
  return "pdf";
}

function formatLabelFor(format: DownloadFormat) {
  if (format === "excel") return "Excel (.xlsx)";
  if (format === "csv") return "CSV (.csv)";
  return "PDF (.pdf)";
}

function isCsvOnlyExportHost(baseUrl: string) {
  return /\/functions\/v1\/public-api\/?$/i.test(baseUrl);
}

function getAllowedFormats(templateType: TemplateKey, csvOnlyExport: boolean): FormatValue[] {
  if (csvOnlyExport) return ["csv", "preview"];
  return templateType === "daily-movement"
    ? ["pdf", "excel", "csv", "preview"]
    : ["pdf", "excel", "csv", "preview"];
}

function getDownloadFormatOptions(
  templateType: TemplateKey,
  csvOnlyExport: boolean
): DownloadFormat[] {
  if (csvOnlyExport) return ["csv"];
  return templateType === "daily-movement" ? ["pdf", "excel", "csv"] : ["pdf", "excel", "csv"];
}

function getDefaultFormat(templateType: TemplateKey, csvOnlyExport: boolean): FormatValue {
  if (csvOnlyExport) return "csv";
  return templateType === "daily-movement" ? "pdf" : "pdf";
}

async function readErrorMessage(response: Response) {
  const fallback = `HTTP ${response.status}: ${response.statusText}`;
  const text = await response.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const message = (parsed as { error?: unknown }).error;
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }
  } catch {
    // ignore JSON parse errors
  }
  return text || fallback;
}

function isNoDataMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("no daily movement data") ||
    normalized.includes("no fuel/temperature data") ||
    (normalized.includes("no fuel") && normalized.includes("temperature data"))
  );
}

function isUnsupportedFormatMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("format not supported") ||
    normalized.includes("use format=preview or format=csv")
  );
}

function toGlobalDatePreset(preset: DatePreset): NonNullable<DateRange["preset"]> {
  if (preset === "last7") return "last_7_days";
  if (preset === "last30") return "last_30_days";
  if (preset === "today") return "today";
  return "custom";
}

function toReportDatePreset(preset?: DateRange["preset"]): DatePreset {
  if (preset === "last_7_days") return "last7";
  if (preset === "last_30_days") return "last30";
  if (preset === "today") return "today";
  return "custom";
}

function reportDatePresetLabel(preset: DatePreset) {
  if (preset === "today") return "Today";
  if (preset === "last7") return "Last 7 Days";
  if (preset === "last30") return "Last 30 Days";
  return undefined;
}

/* ----------------------------- Debounce Hook ------------------------------ */

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/* ----------------------------- Wizard State ------------------------------- */

type WizardState = {
  // UI
  showDataTables: boolean;
  isGenerating: boolean;

  // wizard
  showWizard: boolean;
  currentStep: Step;

  // selections
  selectedTemplate: TemplateKey | null;
  selectedFormat: FormatValue;
  selectedClientId: string;
  vehicleScope: VehicleScope;
  selectedVehicleId: string;
  selectedVehicleIds: string[];
  vehicleSearch: string;

  // dates
  dateFrom: string;
  dateTo: string;
  datePreset: DatePreset;

  // preview
  showPreview: boolean;
  previewType: TemplateKey | null;
  previewDate: string;
  previewEndDate: string;
  previewData: PreviewResponse | null;
  previewLoading: boolean;
  previewError: string | null;

  // preview scaling
  fitToWidth: boolean;
  manualZoom: number;
  previewScale: number;
  previewBaseHeight: number;

  // internal guard
  didApplyDefaultPreset: boolean;
};

type WizardAction =
  | { type: "SET"; patch: Partial<WizardState> }
  | { type: "RESET_WIZARD"; keepWizardOpen?: boolean }
  | { type: "OPEN_WIZARD" }
  | { type: "CLOSE_WIZARD" }
  | { type: "OPEN_PREVIEW"; template: TemplateKey; from: string; to: string }
  | { type: "CLOSE_PREVIEW" };

const INITIAL_STATE: WizardState = {
  showDataTables: false,
  isGenerating: false,

  showWizard: false,
  currentStep: "scope",

  selectedTemplate: null,
  selectedFormat: "pdf",
  selectedClientId: "all",
  vehicleScope: "all",
  selectedVehicleId: "",
  selectedVehicleIds: [],
  vehicleSearch: "",

  dateFrom: "",
  dateTo: "",
  datePreset: "last7",

  showPreview: false,
  previewType: null,
  previewDate: "",
  previewEndDate: "",
  previewData: null,
  previewLoading: false,
  previewError: null,

  fitToWidth: true,
  manualZoom: 0.9,
  previewScale: 1,
  previewBaseHeight: 0,

  didApplyDefaultPreset: false,
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET":
      return { ...state, ...action.patch };

    case "OPEN_WIZARD":
      return { ...state, showWizard: true };

    case "CLOSE_WIZARD":
      return {
        ...state,
        showWizard: false,
        currentStep: "scope",
      };

    case "RESET_WIZARD": {
      const next = { ...INITIAL_STATE };
      if (action.keepWizardOpen) next.showWizard = true;
      return next;
    }

    case "OPEN_PREVIEW":
      return {
        ...state,
        isGenerating: false,
        showPreview: true,
        previewType: action.template,
        previewDate: action.from,
        previewEndDate: action.to,
        previewData: null,
        previewLoading: true,
        previewError: null,
      };

    case "CLOSE_PREVIEW":
      return {
        ...state,
        showPreview: false,
        previewType: null,
        previewDate: "",
        previewEndDate: "",
        previewData: null,
        previewLoading: false,
        previewError: null,
      };

    default:
      return state;
  }
}

/* -------------------------------- Component -------------------------------- */

export function ReportsPage({ pageId }: ReportsPageProps) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const baseUrl = useMemo(() => getBaseUrl(), []);
  const csvOnlyExport = useMemo(() => isCsvOnlyExportHost(baseUrl), [baseUrl]);

  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);

  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewContentRef = useRef<HTMLDivElement | null>(null);
  const previewExportRef = useRef<HTMLDivElement | null>(null);

  const debouncedVehicleSearch = useDebouncedValue(state.vehicleSearch, 200);

  const {
    data: adminClients = [],
    isLoading: adminClientsLoading,
    error: adminClientsError,
  } = useQuery<AdminClient[]>({
    queryKey: ["/api/admin/clients"],
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const {
    data: vehicles = [],
    isLoading: vehiclesLoading,
    error: vehiclesError,
  } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
    staleTime: 5 * 60 * 1000,
  });

  const adminClientsWithVehicles = useMemo(() => {
    if (!isAdmin) return [];
    const vehicleClientIds = new Set(
      vehicles
        .map((vehicle) => vehicle.clientId)
        .filter((clientId): clientId is string => Boolean(clientId))
    );
    const filtered = adminClients.filter((client) => vehicleClientIds.has(client.id));
    return filtered.length > 0 ? filtered : adminClients;
  }, [isAdmin, vehicles, adminClients]);

  const scopedVehicles = useMemo(() => {
    if (isAdmin && state.selectedClientId !== "all") {
      return vehicles.filter((v) => v.clientId === state.selectedClientId);
    }
    return vehicles;
  }, [vehicles, isAdmin, state.selectedClientId]);

  useEffect(() => {
    if (!isAdmin) return;
    if (state.selectedClientId === "all") return;
    const stillValid = adminClientsWithVehicles.some((client) => client.id === state.selectedClientId);
    if (!stillValid) {
      dispatch({
        type: "SET",
        patch: { selectedClientId: adminClientsWithVehicles[0]?.id ?? "all" },
      });
    }
  }, [isAdmin, state.selectedClientId, adminClientsWithVehicles]);

  const selectedVehicle = useMemo(
    () => scopedVehicles.find((v) => v.id === state.selectedVehicleId),
    [scopedVehicles, state.selectedVehicleId]
  );

  const filteredVehicles = useMemo(() => {
    const term = debouncedVehicleSearch.trim().toLowerCase();
    const candidates = term
      ? scopedVehicles.filter((v) => getVehicleLabel(v).toLowerCase().includes(term))
      : scopedVehicles;
    return candidates.slice(0, 6);
  }, [scopedVehicles, debouncedVehicleSearch]);

  /* ------------------------------ Persist state ---------------------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<WizardState>;
      dispatch({
        type: "SET",
        patch: {
          selectedTemplate: parsed.selectedTemplate ?? null,
          selectedFormat: parsed.selectedFormat ?? "pdf",
          selectedClientId: parsed.selectedClientId ?? "all",
          vehicleScope: parsed.vehicleScope ?? "all",
          datePreset: parsed.datePreset ?? "last7",
        },
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const payload = {
      selectedTemplate: state.selectedTemplate,
      selectedFormat: state.selectedFormat,
      selectedClientId: state.selectedClientId,
      vehicleScope: state.vehicleScope,
      datePreset: state.datePreset,
    };
    try {
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [
    state.selectedTemplate,
    state.selectedFormat,
    state.selectedClientId,
    state.vehicleScope,
    state.datePreset,
  ]);

  /* ------------------------------ Derived state ---------------------------- */

  const selectedTemplateMeta = useMemo(
    () => (state.selectedTemplate ? REPORT_TEMPLATES[state.selectedTemplate] : null),
    [state.selectedTemplate]
  );

  const previewFormatOptions = useMemo<DownloadFormat[]>(() => {
    if (!state.previewType) return [];
    return getDownloadFormatOptions(state.previewType, csvOnlyExport);
  }, [state.previewType, csvOnlyExport]);

  const isClientScopeComplete = useMemo(
    () => !isAdmin || state.selectedClientId === "all" || Boolean(state.selectedClientId),
    [isAdmin, state.selectedClientId]
  );

  const isTemplateComplete = Boolean(state.selectedTemplate);

  const isScopeComplete = useMemo(() => {
    if (!state.selectedTemplate || !isClientScopeComplete) return false;
    if (state.vehicleScope === "all") return true;
    if (state.vehicleScope === "single") return Boolean(state.selectedVehicleId);
    return state.selectedVehicleIds.length > 0;
  }, [
    state.selectedTemplate,
    isClientScopeComplete,
    state.vehicleScope,
    state.selectedVehicleId,
    state.selectedVehicleIds.length,
  ]);

  const isDateComplete = useMemo(
    () => !!state.selectedTemplate && isValidDateRange(state.dateFrom, state.dateTo),
    [state.selectedTemplate, state.dateFrom, state.dateTo]
  );

  const currentStepIndex = FLOW_ORDER.indexOf(state.currentStep);

  const canProceed = useMemo(() => {
    if (state.currentStep === "scope") return isScopeComplete;
    if (state.currentStep === "date") return isDateComplete;
    return false;
  }, [state.currentStep, isScopeComplete, isDateComplete]);

  const selectedClientName = useMemo(() => {
    if (!(isAdmin && state.selectedClientId !== "all")) return null;
    return adminClientsWithVehicles.find((c) => c.id === state.selectedClientId)?.name || "Selected client";
  }, [isAdmin, state.selectedClientId, adminClientsWithVehicles]);

  const clientScopeLabel = useMemo(() => {
    if (!isAdmin) return "Your organization";
    if (state.selectedClientId === "all") return "All clients";
    return selectedClientName || "Selected client";
  }, [isAdmin, state.selectedClientId, selectedClientName]);

  const vehicleScopeLabel = useMemo(() => {
    if (state.vehicleScope === "all") return "All vehicles";
    if (state.vehicleScope === "single") {
      return selectedVehicle ? getVehicleLabel(selectedVehicle) : "Single vehicle";
    }
    return `${state.selectedVehicleIds.length} vehicles`;
  }, [state.vehicleScope, selectedVehicle, state.selectedVehicleIds.length]);

  const dateLabel = useMemo(() => {
    if (state.datePreset === "today") return "Today";
    if (state.datePreset === "last7") return "Last 7 Days";
    if (state.datePreset === "last30") return "Last 30 Days";
    if (state.dateFrom && state.dateTo) return `${state.dateFrom} to ${state.dateTo}`;
    return "Custom range";
  }, [state.datePreset, state.dateFrom, state.dateTo]);

  const reportDateRange = useMemo<DateRange>(() => {
    const start = fromDateInputValue(state.dateFrom);
    const end = fromDateInputValue(state.dateTo);
    return {
      preset: toGlobalDatePreset(state.datePreset),
      startDate: start ? start.toISOString() : undefined,
      endDate: end ? end.toISOString() : undefined,
      label: reportDatePresetLabel(state.datePreset),
    };
  }, [state.dateFrom, state.dateTo, state.datePreset]);

  const handleReportDateRangeChange = useCallback((range: DateRange) => {
    const start = range.startDate ? toDateInputValue(new Date(range.startDate)) : "";
    const end = range.endDate ? toDateInputValue(new Date(range.endDate)) : "";
    dispatch({
      type: "SET",
      patch: {
        datePreset: toReportDatePreset(range.preset),
        dateFrom: start,
        dateTo: end,
      },
    });
  }, []);

  const effectiveScale = state.fitToWidth ? state.previewScale : state.manualZoom;

  /* ----------------------------- Smart date preset ------------------------- */

  const applyDatePreset = useCallback((preset: DatePreset) => {
    const today = new Date();

    if (preset === "custom") {
      dispatch({ type: "SET", patch: { datePreset: "custom" } });
      return;
    }

    if (preset === "today") {
      const value = toDateInputValue(today);
      dispatch({ type: "SET", patch: { datePreset: "today", dateFrom: value, dateTo: value } });
      return;
    }

    if (preset === "last7") {
      dispatch({
        type: "SET",
        patch: {
          datePreset: "last7",
          dateFrom: toDateInputValue(addDays(today, -6)),
          dateTo: toDateInputValue(today),
        },
      });
      return;
    }

    dispatch({
      type: "SET",
      patch: {
        datePreset: "last30",
        dateFrom: toDateInputValue(addDays(today, -29)),
        dateTo: toDateInputValue(today),
      },
    });
  }, []);

  useEffect(() => {
    if (!state.showWizard) return;
    if (state.didApplyDefaultPreset) return;
    if (!state.dateFrom && !state.dateTo) {
      applyDatePreset(state.datePreset || "last7");
    }
    dispatch({ type: "SET", patch: { didApplyDefaultPreset: true } });
  }, [
    state.showWizard,
    state.didApplyDefaultPreset,
    state.dateFrom,
    state.dateTo,
    state.datePreset,
    applyDatePreset,
  ]);

  useEffect(() => {
    if (!state.showWizard) return;
    if (!state.dateFrom) return;
    if (!state.dateTo) {
      dispatch({ type: "SET", patch: { dateTo: state.dateFrom } });
      return;
    }
    if (new Date(state.dateFrom) > new Date(state.dateTo)) {
      dispatch({ type: "SET", patch: { dateTo: state.dateFrom } });
    }
  }, [state.showWizard, state.dateFrom, state.dateTo]);

  /* ------------------------------ Scope validity --------------------------- */

  useEffect(() => {
    if (state.vehicleScope === "single" && state.selectedVehicleId) {
      const stillValid = scopedVehicles.some((v) => v.id === state.selectedVehicleId);
      if (!stillValid) dispatch({ type: "SET", patch: { selectedVehicleId: "" } });
    }

    if (state.vehicleScope === "group" && state.selectedVehicleIds.length > 0) {
      const allowed = new Set(scopedVehicles.map((v) => v.id));
      const next = state.selectedVehicleIds.filter((id) => allowed.has(id));
      if (next.length !== state.selectedVehicleIds.length) {
        dispatch({ type: "SET", patch: { selectedVehicleIds: next } });
      }
    }
  }, [state.vehicleScope, state.selectedVehicleId, state.selectedVehicleIds, scopedVehicles]);

  /* ----------------------------- Format enforcement ------------------------ */

  useEffect(() => {
    if (!state.selectedTemplate) return;
    const allowed = getAllowedFormats(state.selectedTemplate, csvOnlyExport);

    if (!allowed.includes(state.selectedFormat)) {
      dispatch({
        type: "SET",
        patch: {
          selectedFormat: getDefaultFormat(state.selectedTemplate, csvOnlyExport),
        },
      });
    }
  }, [state.selectedTemplate, state.selectedFormat, csvOnlyExport]);

  useEffect(() => {
    if (!state.showPreview || previewFormatOptions.length === 0) return;
    if (!previewFormatOptions.includes(state.selectedFormat as DownloadFormat)) {
      dispatch({ type: "SET", patch: { selectedFormat: previewFormatOptions[0] } });
    }
  }, [state.showPreview, previewFormatOptions, state.selectedFormat]);

  /* ------------------------------ Step controls ---------------------------- */

  const openStep = useCallback((step: Step) => {
    dispatch({ type: "SET", patch: { currentStep: step } });
  }, []);

  const goBack = useCallback(() => {
    const idx = FLOW_ORDER.indexOf(state.currentStep);
    if (idx <= 0) return;
    const prev = FLOW_ORDER[idx - 1];
    dispatch({ type: "SET", patch: { currentStep: prev } });
  }, [state.currentStep]);

  const goNext = useCallback(() => {
    if (!canProceed) return;
    const next = FLOW_ORDER[Math.min(currentStepIndex + 1, FLOW_ORDER.length - 1)];
    dispatch({ type: "SET", patch: { currentStep: next } });
  }, [canProceed, currentStepIndex]);

  /* ------------------------------ Filters builder -------------------------- */

  const getAssetFilters = useCallback(
    (templateType?: TemplateKey) => {
      const filters: Record<string, string> = {};

      if (isAdmin && state.selectedClientId !== "all") {
        filters.client_id = state.selectedClientId;
      }

      if (state.vehicleScope === "all") return filters;

      if (state.vehicleScope === "group") {
        if (state.selectedVehicleIds.length > 0) {
          filters.vehicle_ids = state.selectedVehicleIds.join(",");
        }
        return filters;
      }

      if (!selectedVehicle) return filters;

      const assetIdValue = String(selectedVehicle.assetId || "").trim();
      const plateValue = String(selectedVehicle.vehiclePlate || "").trim();
      const isNumericAssetId = assetIdValue.length > 0 && !Number.isNaN(Number(assetIdValue));

      filters.vehicle_id = selectedVehicle.id;

      if (templateType === "fuel-temperature") {
        if (assetIdValue) filters.asset_name = assetIdValue;
        else if (plateValue) filters.asset_name = plateValue;
        return filters;
      }

      if (isNumericAssetId) filters.asset_id = assetIdValue;
      else if (plateValue) filters.registration_number = plateValue;

      return filters;
    },
    [isAdmin, state.selectedClientId, state.vehicleScope, state.selectedVehicleIds, selectedVehicle]
  );

  /* ------------------------------ Preview fetch ---------------------------- */

  const previewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!state.showPreview || !state.previewType || !state.previewDate) return;

    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    (async () => {
      dispatch({
        type: "SET",
        patch: { previewLoading: true, previewError: null, previewData: null },
      });

      try {
        const endpoint =
          state.previewType === "daily-movement"
            ? `/api/reports/preview-daily-movement/${state.previewDate}`
            : `/api/reports/preview-fuel-temperature/${state.previewDate}`;

        const query = new URLSearchParams();
        query.set("start_date", state.previewDate);
        query.set("end_date", state.previewEndDate || state.previewDate);

        const assetFilters = getAssetFilters(state.previewType ?? undefined);
        Object.entries(assetFilters).forEach(([k, v]) => {
          if (v) query.set(k, String(v));
        });

        const url = `${baseUrl}${endpoint}${query.toString() ? `?${query.toString()}` : ""}`;

        const response = await fetch(url, {
          method: "GET",
          headers: getAuthHeaders(),
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);
          if (isNoDataMessage(message)) {
            dispatch({
              type: "SET",
              patch: {
                previewLoading: false,
                previewError: null,
                previewData: null,
              },
            });
            return;
          }
          throw new Error(message || "Failed to load preview");
        }

        const data = (await response.json()) as PreviewResponse;
        dispatch({ type: "SET", patch: { previewData: data, previewLoading: false } });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        dispatch({
          type: "SET",
          patch: {
            previewError: e?.message || "Failed to load preview",
            previewLoading: false,
          },
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    state.showPreview,
    state.previewType,
    state.previewDate,
    state.previewEndDate,
    baseUrl,
    getAssetFilters,
  ]);

  /* ------------------------- Preview scaling (fit/zoom) -------------------- */

  useLayoutEffect(() => {
    const container = previewContainerRef.current;
    const content = previewContentRef.current;
    if (!container || !content) return;

    const updateScale = () => {
      const containerWidth = container.clientWidth;
      const baseWidth = content.scrollWidth || 1;
      const baseHeight = content.scrollHeight || 0;

      dispatch({ type: "SET", patch: { previewBaseHeight: baseHeight } });

      if (state.fitToWidth) {
        const next = Math.min(1, containerWidth / baseWidth);
        dispatch({ type: "SET", patch: { previewScale: Number(next.toFixed(2)) } });
      }
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [state.fitToWidth, state.previewType, state.previewData]);

  /* ------------------------------ Preview mapping -------------------------- */

  const dailyMovementPreviewGroups = useMemo(() => {
    if (!state.previewData?.reports || !Array.isArray(state.previewData.reports)) return [];

    return state.previewData.reports.map((report: any) => {
      const assetDescription = report.assetDescription ?? report.asset_description ?? "";
      const registrationNumber = report.registrationNumber ?? report.registration_number ?? "";
      const assetId = Number(report.assetId ?? report.asset_id ?? 0);
      const siteName = report.siteName ?? report.site_name ?? "";
      const movements = Array.isArray(report.movements) ? report.movements : [];

      return {
        asset: {
          asset_description: assetDescription,
          registration_number: registrationNumber,
          asset_id: assetId,
          site_name: siteName,
        },
        trips: movements.map((trip: any) => ({
          asset_description: assetDescription,
          registration_number: registrationNumber,
          asset_id: assetId,
          site_name: siteName,
          departure_date: trip.departureDate ?? trip.departure_date ?? "",
          departure_date_time:
            trip.departureDateTime ?? trip.departure_date_time ?? "",
          driver: trip.driver ?? "",
          departure_time: trip.departureTime ?? trip.departure_time ?? "",
          departed_from: trip.departedFrom ?? trip.departed_from ?? "",
          driving_time: trip.drivingTime ?? trip.driving_time ?? "",
          standing_time: trip.standingTime ?? trip.standing_time ?? "",
          distance_km: Number(trip.distanceKm ?? trip.distance_km ?? 0),
          max_speed_kmh: Number(trip.maxSpeedKmh ?? trip.max_speed_kmh ?? 0),
          arrival_date_time:
            trip.arrivalDateTime ?? trip.arrival_date_time ?? "",
          arrival_time: trip.arrivalTime ?? trip.arrival_time ?? "",
          arrived_at: trip.arrivedAt ?? trip.arrived_at ?? "",
          next_departure: trip.nextDeparture ?? trip.next_departure ?? "",
          standing_time_at_location:
            trip.standingTimeAtLocation ?? trip.standing_time_at_location ?? "",
          fuel_used_litres: trip.fuelUsedLitres ?? trip.fuel_used_litres ?? null,
        })),
        totals: {
          drivingTime: report.totals?.totalDrivingTime ?? report.totals?.drivingTime ?? "",
          distance: Number(report.totals?.totalDistance ?? report.totals?.distance ?? 0),
          standingTime:
            report.totals?.totalStandingTime ??
            report.totals?.standingTime ??
            "",
          standingTimeAtLocation:
            report.totals?.totalStandingAtLocation ??
            report.totals?.standingTimeAtLocation ??
            "",
        },
        averages: {
          drivingTime: report.averages?.avgDrivingTime ?? report.averages?.drivingTime ?? "",
          distance: Number(report.averages?.avgDistance ?? report.averages?.distance ?? 0),
          standingTime:
            report.averages?.avgStandingTime ??
            report.averages?.standingTime ??
            "",
          standingTimeAtLocation:
            report.averages?.avgStandingAtLocation ??
            report.averages?.standingTimeAtLocation ??
            "",
        },
      };
    });
  }, [state.previewData]);

  const fuelTemperaturePreviewData = useMemo<any>(() => {
    if (!state.previewData) return null;
    return {
      ...state.previewData,
      totalDistance: Number(state.previewData.totalDistance ?? 0),
      totalRefills: Number(state.previewData.totalRefills ?? 0),
      totalDrains: Number(state.previewData.totalDrains ?? 0),
      fuelUsed: Number(state.previewData.fuelUsed ?? 0),
      fuelConsumption: Number(state.previewData.fuelConsumption ?? 0),
      refuelEvents: Array.isArray(state.previewData.refuelEvents)
        ? state.previewData.refuelEvents
        : [],
    };
  }, [state.previewData]);

  /* ------------------------------ Download logic --------------------------- */

  const downloadReport = useCallback(
    async (
      templateType: TemplateKey,
      startDate: string,
      endDate: string,
      formatOverride?: DownloadFormat,
      fileHandle?: any
    ) => {
      const requestedFormat = formatOverride
        ? formatOverride
        : resolveDownloadFormat(templateType, state.selectedFormat, csvOnlyExport);
      const safeEndDate = endDate || startDate;
      const rangeLabel = safeEndDate === startDate ? startDate : `${startDate}_${safeEndDate}`;
      const extension =
        requestedFormat === "excel" ? "xlsx" : requestedFormat === "csv" ? "csv" : "pdf";
      const filename =
        templateType === "daily-movement"
          ? `daily_movement_${rangeLabel}.${extension}`
          : `fuel_temperature_${rangeLabel}.${extension}`;

      if (requestedFormat !== "csv") {
        if (!state.previewData) {
          throw new Error("Preview data is still loading. Try again in a moment.");
        }

        if (!previewExportRef.current) {
          throw new Error("Preview layout is not ready for export yet. Try again in a moment.");
        }

        await exportPreviewSnapshot({
          element: previewExportRef.current,
          filename,
          format: requestedFormat,
          fileHandle,
          excelData:
            requestedFormat === "excel"
              ? templateType === "daily-movement"
                ? {
                    type: "daily-movement",
                    report: {
                      dateLabel: safeEndDate === startDate ? startDate : `${startDate} to ${safeEndDate}`,
                      companyName: state.previewData?.companyName,
                      groups: dailyMovementPreviewGroups,
                    },
                  }
                : {
                    type: "fuel-temperature",
                    report: fuelTemperaturePreviewData,
                  }
              : undefined,
          worksheetName:
            templateType === "daily-movement"
              ? "Daily Movement Report"
              : "Fuel & Temperature Report",
        });

        return { requestedFormat, deliveredFormat: requestedFormat };
      }

      const assetFilters = getAssetFilters(templateType);
      const requestReport = (format: DownloadFormat) => {
        const params = new URLSearchParams({
          format,
          start_date: startDate,
          end_date: safeEndDate,
          report_type: templateType,
        });

        Object.entries(assetFilters).forEach(([key, value]) => {
          if (value) params.set(key, String(value));
        });

        return fetch(`${baseUrl}/api/reports/generate?${params.toString()}`, {
          method: "GET",
          headers: getAuthHeaders(),
        });
      };

      let deliveredFormat: DownloadFormat = requestedFormat;
      let response = await requestReport(deliveredFormat);

      if (!response.ok) {
        const message = await readErrorMessage(response);
        const shouldRetryAsCsv =
          deliveredFormat !== "csv" &&
          (response.status === 501 || isUnsupportedFormatMessage(message));

        if (!shouldRetryAsCsv) {
          throw new Error(message);
        }

        deliveredFormat = "csv";
        response = await requestReport(deliveredFormat);
        if (!response.ok) {
          const retryMessage = await readErrorMessage(response);
          throw new Error(retryMessage);
        }
      }

      const blob = await response.blob();

      await saveBlobToFile(blob, filename, fileHandle);
      return { requestedFormat, deliveredFormat };
    },
    [
      baseUrl,
      csvOnlyExport,
      dailyMovementPreviewGroups,
      fuelTemperaturePreviewData,
      getAssetFilters,
      state.previewData,
      state.selectedFormat,
    ]
  );

  const previewGeneratedLabel = useMemo(() => {
    const raw = state.previewData?.generatedOn;
    if (!raw) return formatDateTimeEAT(new Date());
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? formatDateTimeEAT(new Date()) : formatDateTimeEAT(parsed);
  }, [state.previewData]);

  const previewDateLabel = useMemo(() => {
    if (!state.previewDate) return "";
    if (state.previewEndDate && state.previewEndDate !== state.previewDate) {
      return `${state.previewDate} to ${state.previewEndDate}`;
    }
    return state.previewDate;
  }, [state.previewDate, state.previewEndDate]);

  const fuelPreviewDate = useMemo(() => {
    const reportDate = state.previewData?.reportDate;
    if (typeof reportDate === "string") {
      const parsed = new Date(reportDate);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    }
    return state.previewDate;
  }, [state.previewData, state.previewDate]);

  /* ------------------------------ Actions ---------------------------------- */

  const handleTemplateSelect = useCallback(
    (template: TemplateKey) => {
      dispatch({ type: "OPEN_WIZARD" });

      const defaultFormat = getDefaultFormat(template, csvOnlyExport);
      const allowed = getAllowedFormats(template, csvOnlyExport);

      const nextFormat = allowed.includes(state.selectedFormat)
        ? state.selectedFormat
        : defaultFormat;

      dispatch({
        type: "SET",
        patch: {
          selectedTemplate: template,
          selectedFormat: nextFormat,
          currentStep: "scope",
          didApplyDefaultPreset: false,
        },
      });
    },
    [csvOnlyExport, state.selectedFormat]
  );

  const handleCloseModal = useCallback(() => {
    dispatch({ type: "CLOSE_WIZARD" });
  }, []);

  const getValidationError = useCallback((): string | null => {
    if (!state.dateFrom || !state.dateTo) return "Please select a date range.";
    if (new Date(state.dateFrom) > new Date(state.dateTo)) {
      return "The end date cannot be before the start date.";
    }
    if (state.vehicleScope === "single" && !state.selectedVehicleId) {
      return "Please select a vehicle.";
    }
    if (state.vehicleScope === "group" && state.selectedVehicleIds.length === 0) {
      return "Please select at least one vehicle.";
    }
    return null;
  }, [
    state.dateFrom,
    state.dateTo,
    state.vehicleScope,
    state.selectedVehicleId,
    state.selectedVehicleIds.length,
  ]);

  const handleGenerateFromModal = useCallback(async () => {
    if (!state.selectedTemplate) return;

    const err = getValidationError();
    if (err) {
      toast({
        title: "Missing Information",
        description: err,
        variant: "destructive",
      });
      return;
    }

    dispatch({ type: "SET", patch: { isGenerating: true } });

    dispatch({
      type: "OPEN_PREVIEW",
      template: state.selectedTemplate,
      from: state.dateFrom,
      to: state.dateTo,
    });
    return;
  }, [
    state.selectedTemplate,
    state.dateFrom,
    state.dateTo,
    getValidationError,
    toast,
  ]);

  /* ---------------------------------- UI ---------------------------------- */

  if (state.showDataTables) {
    return (
      <div className="space-y-6">
        <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <PageHeader pageId={pageId || "reports"} className="mb-0" />
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "SET", patch: { showDataTables: false } })}
          >
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
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <PageHeader pageId={pageId || "reports"} className="mb-0" />
        <Button
          onClick={() => dispatch({ type: "SET", patch: { showDataTables: true } })}
          className="flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          View Data Tables
        </Button>
      </div>

      {/* Report Library */}
      {!state.showWizard && (
        <GlassCard className="p-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">Report Library</h2>
        <p className="text-muted-foreground mb-8">
          Choose from our curated reports designed for fleet intelligence and decision-making.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Movement */}
          <GlassCard className="p-6 hover-elevate motion-premium cursor-pointer border border-border/30">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <FileText className="w-6 h-6 text-blue-500" />
              </div>
              <div className="text-xs text-muted-foreground bg-card/20 px-2 py-1 rounded-full border border-border/20">
                Operations
              </div>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-2">
              Daily Movement Report
            </h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              Operational movement story with asset-by-asset travel, dwell time, speed, and fuel
              coverage
            </p>

            <Button className="w-full" onClick={() => handleTemplateSelect("daily-movement")}>
              Start
            </Button>
          </GlassCard>

          {/* Fuel & Temperature */}
          <GlassCard className="p-6 hover-elevate motion-premium cursor-pointer border border-border/30">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <Thermometer className="w-6 h-6 text-orange-500" />
              </div>
              <div className="text-xs text-muted-foreground bg-card/20 px-2 py-1 rounded-full border border-border/20">
                Maintenance
              </div>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-2">
              Fuel & Temperature Report
            </h3>
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              EXACT sensor/fuel/temperature report with refuel events - identical to PDF sample
            </p>

            <Button className="w-full" onClick={() => handleTemplateSelect("fuel-temperature")}>
              Start
            </Button>
          </GlassCard>
        </div>
        </GlassCard>
      )}

      {/* Report Wizard */}
      {state.showWizard && (
        <GlassCard
          hover={false}
          interactive={false}
          className="p-6 border border-border/30 bg-card/95 backdrop-blur-xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-primary" />
                {selectedTemplateMeta?.title ?? "Select a report"}
              </h2>
            </div>
            <Button variant="outline" size="sm" onClick={handleCloseModal}>Close</Button>
          </div>

          {/* Stepper */}
          {state.selectedTemplate && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/30 bg-card/60 px-4 py-3 text-xs">
              {STEP_ORDER.map((step, index) => {
                const label = step.charAt(0).toUpperCase() + step.slice(1);
                const isComplete =
                  (step === "scope" && isScopeComplete) ||
                  (step === "date" && isDateComplete) ||
                  step === "review";

                const isActive = state.currentStep === step;

                return (
                  <button
                    key={step}
                    type="button"
                    onClick={() => openStep(step)}
                    className="flex items-center gap-2"
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isActive
                          ? "bg-primary ring-4 ring-primary/20"
                          : isComplete
                            ? "bg-primary/70"
                            : "bg-muted-foreground/30"
                      }`}
                    />
                    <span
                      className={
                        isActive ? "text-foreground font-semibold" : "text-muted-foreground"
                      }
                    >
                      {label}
                    </span>
                    {index < STEP_ORDER.length - 1 && (
                      <span className="h-px w-6 bg-border/60" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {isScopeComplete && (
              <button
                type="button"
                onClick={() => openStep("scope")}
                className="flex items-center gap-2 rounded-full border border-border/40 bg-card/70 px-3 py-1 text-xs text-foreground"
              >
                Scope: {clientScopeLabel} | {vehicleScopeLabel}
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            {isDateComplete && (
              <button
                type="button"
                onClick={() => openStep("date")}
                className="flex items-center gap-2 rounded-full border border-border/40 bg-card/70 px-3 py-1 text-xs text-foreground"
              >
                Date: {dateLabel}
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Step body */}
          <div className="rounded-2xl border border-border/30 bg-card/60 p-4 min-h-[420px]">
            {state.currentStep === "scope" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Who should this report cover?</h3>
                  <p className="text-sm text-muted-foreground">Choose the client and vehicles to include.</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                    <div className="text-sm font-medium text-foreground mb-3">Client scope</div>
                    {!isAdmin && (
                      <div className="text-sm text-muted-foreground">This report is for your organization.</div>
                    )}
                    {isAdmin && (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          {[
                            { value: "all", label: "All clients" },
                            { value: "specific", label: "Specific client" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                if (option.value === "all") {
                                  dispatch({ type: "SET", patch: { selectedClientId: "all" } });
                                  return;
                                }
                                const fallbackId = adminClientsWithVehicles[0]?.id || "";
                                dispatch({
                                  type: "SET",
                                  patch: {
                                    selectedClientId:
                                      state.selectedClientId === "all" ? fallbackId : state.selectedClientId,
                                  },
                                });
                              }}
                              className={`rounded-full border px-3 py-1 text-xs transition ${
                                (option.value === "all" && state.selectedClientId === "all") ||
                                (option.value === "specific" && state.selectedClientId !== "all")
                                  ? "border-primary/60 bg-primary/10 text-primary"
                                  : "border-border/60 text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        {state.selectedClientId !== "all" && (
                          <Select
                            value={state.selectedClientId}
                            onValueChange={(value) =>
                              dispatch({ type: "SET", patch: { selectedClientId: value } })
                            }
                          >
                            <SelectTrigger className="bg-card/40 border-border/30">
                              <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                            <SelectContent>
                              {adminClientsLoading && (
                                <SelectItem value="loading" disabled>Loading clients...</SelectItem>
                              )}
                              {adminClientsError && (
                                <SelectItem value="error" disabled>Failed to load clients</SelectItem>
                              )}
                              {!adminClientsLoading &&
                                !adminClientsError &&
                                adminClientsWithVehicles.map((client) => (
                                <SelectItem key={client.id} value={client.id}>
                                  {client.name}
                                </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/40 bg-background/40 p-4">
                    <div className="text-sm font-medium text-foreground mb-3">Vehicle scope</div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[
                        { value: "all", label: "All vehicles" },
                        { value: "single", label: "Single vehicle" },
                        { value: "group", label: "Custom group" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            const next = option.value as VehicleScope;
                            dispatch({
                              type: "SET",
                              patch: {
                                vehicleScope: next,
                                selectedVehicleId: next === "single" ? state.selectedVehicleId : "",
                                selectedVehicleIds: next === "group" ? state.selectedVehicleIds : [],
                                vehicleSearch: next === "group" ? state.vehicleSearch : "",
                              },
                            });
                          }}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            state.vehicleScope === option.value
                              ? "border-primary/60 bg-primary/10 text-primary"
                              : "border-border/60 text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {state.vehicleScope === "single" && (
                      <div className="space-y-2">
                        <Select
                          value={state.selectedVehicleId}
                          onValueChange={(value) =>
                            dispatch({ type: "SET", patch: { selectedVehicleId: value } })
                          }
                        >
                          <SelectTrigger className="bg-card/40 border-border/30">
                            <SelectValue placeholder="Select vehicle" />
                          </SelectTrigger>
                          <SelectContent>
                            {vehiclesLoading && (
                              <SelectItem value="loading" disabled>Loading vehicles...</SelectItem>
                            )}
                            {vehiclesError && (
                              <SelectItem value="error" disabled>Failed to load vehicles</SelectItem>
                            )}
                            {!vehiclesLoading && !vehiclesError && scopedVehicles.length === 0 && (
                              <SelectItem value="empty" disabled>No vehicles found</SelectItem>
                            )}
                            {!vehiclesLoading && !vehiclesError && scopedVehicles.map((vehicle) => (
                              <SelectItem key={vehicle.id} value={vehicle.id}>
                                {getVehicleLabel(vehicle)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {state.vehicleScope === "group" && (
                      <div className="space-y-3">
                        <Input
                          value={state.vehicleSearch}
                          onChange={(event) =>
                            dispatch({ type: "SET", patch: { vehicleSearch: event.target.value } })
                          }
                          placeholder="Search vehicles..."
                          className="bg-card/40 border-border/30"
                        />
                        <div className="grid grid-cols-1 gap-2">
                          {filteredVehicles.length === 0 && (
                            <div className="text-xs text-muted-foreground">No matches. Refine your search.</div>
                          )}
                          {filteredVehicles.map((vehicle) => {
                            const isSelected = state.selectedVehicleIds.includes(vehicle.id);
                            return (
                              <button
                                key={vehicle.id}
                                type="button"
                                onClick={() => {
                                  const next = isSelected
                                    ? state.selectedVehicleIds.filter((id) => id !== vehicle.id)
                                    : [...state.selectedVehicleIds, vehicle.id];
                                  dispatch({ type: "SET", patch: { selectedVehicleIds: next } });
                                }}
                                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${
                                  isSelected
                                    ? "border-primary/50 bg-primary/10 text-primary"
                                    : "border-border/40 text-foreground hover:border-primary/40"
                                }`}
                              >
                                <span>{getVehicleLabel(vehicle)}</span>
                                <span>{isSelected ? "Remove" : "Add"}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {state.selectedVehicleIds.slice(0, 6).map((id) => {
                            const vehicle = scopedVehicles.find((item) => item.id === id);
                            if (!vehicle) return null;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() =>
                                  dispatch({
                                    type: "SET",
                                    patch: {
                                      selectedVehicleIds: state.selectedVehicleIds.filter((item) => item !== id),
                                    },
                                  })
                                }
                                className="rounded-full border border-border/40 bg-card/70 px-3 py-1 text-[11px] text-foreground"
                              >
                                {getVehicleLabel(vehicle)} x
                              </button>
                            );
                          })}
                          {state.selectedVehicleIds.length > 6 && (
                            <span className="text-xs text-muted-foreground">
                              +{state.selectedVehicleIds.length - 6} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {state.currentStep === "date" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">When should this report cover?</h3>
                  <p className="text-sm text-muted-foreground">Pick a preset or choose a custom range.</p>
                </div>
                <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">Date Range</Label>
                  <DateRangePicker
                    value={reportDateRange}
                    onChange={handleReportDateRangeChange}
                    presets={REPORT_DATE_PRESETS}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {state.currentStep === "review" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Review and generate</h3>
                  <p className="text-sm text-muted-foreground">Confirm everything looks right before running.</p>
                </div>
                  <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Scope</span>
                      <span className="font-medium text-foreground">{clientScopeLabel} | {vehicleScopeLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Date range</span>
                      <span className="font-medium text-foreground">{dateLabel}</span>
                    </div>
                  </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={goBack} disabled={currentStepIndex === 0}>
                      Back
                    </Button>
                  </div>
                  <Button
                    onClick={handleGenerateFromModal}
                    disabled={!isTemplateComplete || !isScopeComplete || !isDateComplete || state.isGenerating}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Preview Report
                  </Button>
                </div>
              </div>
            )}
          </div>

          {state.currentStep !== "review" && (
            <div className="flex items-center justify-between border-t border-border/30 pt-3">
              <div className="text-xs text-muted-foreground">Step {currentStepIndex + 1} of {FLOW_ORDER.length}</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={goBack} disabled={currentStepIndex === 0}>
                  Back
                </Button>
                <Button onClick={goNext} disabled={!canProceed}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </GlassCard>
      )}
      {state.isGenerating && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="w-[min(92vw,520px)] rounded-2xl border border-border/40 bg-gradient-to-br from-card/95 via-card/90 to-card/80 p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-foreground">Preparing report</div>
                <div className="text-sm text-muted-foreground">
                  Validating, fetching, and packaging your file.
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Validate</span>
                <span>Fetch</span>
                <span>Package</span>
              </div>
              <Progress value={65} className="h-2 bg-muted/40" />
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              Your download will start automatically when ready.
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <Dialog
        open={state.showPreview}
        onOpenChange={(open) => {
          if (!open) {
            dispatch({ type: "CLOSE_PREVIEW" });
          } else {
            dispatch({ type: "SET", patch: { showPreview: true } });
          }
        }}
      >
        <DialogContent className="max-w-7xl h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {state.previewType === "daily-movement"
                ? "Daily Movement Report Preview"
                : "Fuel & Temperature Report Preview"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/30 bg-card/50 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-medium text-foreground">Preview scale</span>
              <button
                type="button"
                onClick={() => dispatch({ type: "SET", patch: { fitToWidth: true } })}
                className={`rounded-full border px-2 py-1 text-xs transition ${
                  state.fitToWidth
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground"
                }`}
              >
                Fit to width
              </button>
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "SET", patch: { fitToWidth: false, manualZoom: 1 } })
                }
                className={`rounded-full border px-2 py-1 text-xs transition ${
                  !state.fitToWidth && state.manualZoom === 1
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground"
                }`}
              >
                100%
              </button>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Zoom</span>
              {[0.6, 0.8, 1].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "SET",
                      patch: { fitToWidth: false, manualZoom: level },
                    })
                  }
                  className={`rounded-full border px-2 py-1 text-xs transition ${
                    !state.fitToWidth && state.manualZoom === level
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground"
                  }`}
                >
                  {Math.round(level * 100)}%
                </button>
              ))}
              <span className="text-foreground">{Math.round(effectiveScale * 100)}%</span>
            </div>
          </div>

          <div ref={previewContainerRef} className="flex-1 overflow-auto p-4 bg-gray-50">
            {state.previewLoading && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading preview...
              </div>
            )}

            {state.previewError && (
              <div className="flex h-full items-center justify-center text-sm text-destructive">
                {state.previewError}
              </div>
            )}

            {!state.previewLoading &&
              !state.previewError &&
              state.previewType === "daily-movement" &&
              (dailyMovementPreviewGroups.length > 0 ? (
                <div className="flex justify-center">
                  <div
                    style={{
                      height: state.previewBaseHeight
                        ? state.previewBaseHeight * effectiveScale
                        : undefined,
                    }}
                    className="relative"
                  >
                    <div
                      ref={previewContentRef}
                      style={{
                        transform: `scale(${effectiveScale})`,
                        transformOrigin: "top center",
                      }}
                      className="bg-white shadow-lg"
                    >
                      <DailyMovementPreview
                        date={previewDateLabel}
                        data={dailyMovementPreviewGroups}
                        companyName={state.previewData?.companyName}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No preview data available for this date.
                </div>
              ))}

            {!state.previewLoading &&
              !state.previewError &&
              state.previewType === "fuel-temperature" &&
              (fuelTemperaturePreviewData ? (
                <div className="flex justify-center">
                  <div
                    style={{
                      height: state.previewBaseHeight
                        ? state.previewBaseHeight * effectiveScale
                        : undefined,
                    }}
                    className="relative"
                  >
                    <div
                      ref={previewContentRef}
                      style={{
                        transform: `scale(${effectiveScale})`,
                        transformOrigin: "top center",
                      }}
                      className="bg-white shadow-lg"
                    >
                      <FuelTemperaturePreview
                        date={fuelPreviewDate}
                        data={fuelTemperaturePreviewData}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No preview data available for this date.
                </div>
              ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Generated: {previewGeneratedLabel}</span>
              {previewFormatOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Download as</span>
                  <div className="flex flex-wrap gap-2">
                    {previewFormatOptions.map((format) => {
                      const isActive = state.selectedFormat === format;
                      return (
                        <button
                          key={format}
                          type="button"
                          onClick={() => dispatch({ type: "SET", patch: { selectedFormat: format } })}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            isActive
                              ? "border-primary/60 bg-primary/10 text-primary"
                              : "border-border/60 text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {formatLabelFor(format)}
                        </button>
                      );
                    })}
                  </div>
                  {csvOnlyExport && (
                    <span className="text-[11px] text-muted-foreground">
                      CSV-only export on this host.
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => dispatch({ type: "CLOSE_PREVIEW" })}>
                <X className="w-4 h-4 mr-2" />
                Close Preview
              </Button>
              {previewFormatOptions.map((format) => (
                <Button
                  key={format}
                  variant={format === "excel" ? "default" : "outline"}
                  onClick={async () => {
                    if (!state.previewType) return;
                    try {
                      const resolvedEndDate = state.previewEndDate || state.previewDate;
                      const rangeLabel =
                        resolvedEndDate === state.previewDate
                          ? state.previewDate
                          : `${state.previewDate}_${resolvedEndDate}`;
                      const extension =
                        format === "excel" ? "xlsx" : format === "csv" ? "csv" : "pdf";
                      const filename =
                        state.previewType === "daily-movement"
                          ? `daily_movement_${rangeLabel}.${extension}`
                          : `fuel_temperature_${rangeLabel}.${extension}`;
                      const result = await downloadReport(
                        state.previewType,
                        state.previewDate,
                        resolvedEndDate,
                        format
                      );
                      const fallbackNote =
                        result.deliveredFormat !== result.requestedFormat
                          ? " Downloaded as CSV because current backend export supports CSV/preview."
                          : "";
                      toast({
                        title: "Report Download Started",
                        description: `${
                          state.previewType === "daily-movement"
                            ? "Daily Movement Report"
                            : "Fuel & Temperature Report"
                        } for ${previewDateLabel}.${fallbackNote}`,
                      });
                      dispatch({ type: "CLOSE_PREVIEW" });
                    } catch (e: any) {
                      if (e?.name === "AbortError") return;
                      toast({
                        title: "Error Downloading Report",
                        description: e?.message || "Failed to download the report.",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={
                    state.previewLoading ||
                    Boolean(state.previewError) ||
                    !state.previewType ||
                    !state.previewData
                  }
                >
                  <Download className="w-4 h-4 mr-2" />
                  {format === "excel"
                    ? "Download Excel"
                    : format === "csv"
                      ? "Download CSV"
                      : "Download PDF"}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {state.showPreview &&
        !state.previewLoading &&
        !state.previewError &&
        ((state.previewType === "daily-movement" && dailyMovementPreviewGroups.length > 0) ||
          (state.previewType === "fuel-temperature" && fuelTemperaturePreviewData)) && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed top-0"
            style={{ left: -10000 }}
          >
            <div ref={previewExportRef} className="bg-white">
              {state.previewType === "daily-movement" ? (
                <DailyMovementPreview
                  date={previewDateLabel}
                  data={dailyMovementPreviewGroups}
                  companyName={state.previewData?.companyName}
                />
              ) : (
                <FuelTemperaturePreview
                  date={fuelPreviewDate}
                  data={fuelTemperaturePreviewData}
                />
              )}
            </div>
          </div>
        )}
    </div>
  );
}
