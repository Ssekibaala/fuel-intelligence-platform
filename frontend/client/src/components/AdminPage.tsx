import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "./AuthProvider";
import { api } from "@/lib/api";
import { PageHeader } from "./PageHeader";
import {
  Building2,
  Database,
  FileSpreadsheet,
  Link2,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

interface AdminPageProps {
  pageId?: string;
}

type SourceOfTruthResult = {
  mode: "preview" | "apply";
  fingerprint: string;
  detectedReportType: string;
  fileName: string;
  period: {
    startDate: string;
    endDate: string;
  };
  assets: {
    inFile: number;
    matched: number;
    unmatched: string[];
  };
  rows: {
    inFile: number;
    matched: number;
  };
  tables: {
    tripReports: { deleted: number; inserted: number };
    dailyMetrics: { deleted: number; inserted: number };
    fuelEvents: { deleted: number; inserted: number };
  };
  preview: {
    tripReports: Array<{
      registrationNumber: string | null;
      departureTime: string | null;
      arrivalTime: string | null;
      distanceKm: number | null;
      fuelUsedLitres: number | null;
      sourceTripKey: string | null;
    }>;
    dailyMetrics: Array<{
      metricDay: string;
      registrationNumber: string | null;
      totalDistanceTraveled: number;
      totalFuelConsumed: number;
      totalEngineHours: number;
      refillCount: number;
      theftCount: number;
    }>;
    fuelEvents: Array<{
      registrationNumber: string | null;
      eventType: string;
      volumeLiters: number;
      eventTime: string | null;
      location: string | null;
    }>;
  };
  notes: string[];
};

function toSafeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toSafeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry));
}

function normalizeSourceOfTruthResult(value: unknown): SourceOfTruthResult {
  let candidate: unknown = value;

  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (!trimmed) {
      throw new Error("Source-of-truth endpoint returned an empty response.");
    }

    if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
      throw new Error(
        "Source-of-truth endpoint returned HTML instead of JSON. Restart the backend and retry preview."
      );
    }

    try {
      candidate = JSON.parse(trimmed);
    } catch {
      throw new Error(`Source-of-truth endpoint returned non-JSON text: ${trimmed.slice(0, 180)}`);
    }
  }

  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid source-of-truth response payload.");
  }

  const raw = candidate as Record<string, any>;
  if (typeof raw.error === "string" && raw.error.trim().length > 0) {
    throw new Error(raw.error.trim());
  }
  if (typeof raw.message === "string" && raw.message.trim().length > 0 && !raw.period && !raw.rows && !raw.tables) {
    throw new Error(raw.message.trim());
  }
  const period = raw.period && typeof raw.period === "object" ? raw.period : {};
  const assets = raw.assets && typeof raw.assets === "object" ? raw.assets : {};
  const rows = raw.rows && typeof raw.rows === "object" ? raw.rows : {};
  const tables = raw.tables && typeof raw.tables === "object" ? raw.tables : {};
  const tableTrip = tables.tripReports && typeof tables.tripReports === "object" ? tables.tripReports : {};
  const tableDaily = tables.dailyMetrics && typeof tables.dailyMetrics === "object" ? tables.dailyMetrics : {};
  const tableFuel = tables.fuelEvents && typeof tables.fuelEvents === "object" ? tables.fuelEvents : {};
  const preview = raw.preview && typeof raw.preview === "object" ? raw.preview : {};

  const previewTripReports = Array.isArray(preview.tripReports)
    ? preview.tripReports.map((entry: any) => ({
        registrationNumber: entry?.registrationNumber ? String(entry.registrationNumber) : null,
        departureTime: entry?.departureTime ? String(entry.departureTime) : null,
        arrivalTime: entry?.arrivalTime ? String(entry.arrivalTime) : null,
        distanceKm: entry?.distanceKm === null || entry?.distanceKm === undefined ? null : toSafeNumber(entry.distanceKm),
        fuelUsedLitres: entry?.fuelUsedLitres === null || entry?.fuelUsedLitres === undefined ? null : toSafeNumber(entry.fuelUsedLitres),
        sourceTripKey: entry?.sourceTripKey ? String(entry.sourceTripKey) : null,
      }))
    : [];

  const previewDailyMetrics = Array.isArray(preview.dailyMetrics)
    ? preview.dailyMetrics.map((entry: any) => ({
        metricDay: toSafeString(entry?.metricDay),
        registrationNumber: entry?.registrationNumber ? String(entry.registrationNumber) : null,
        totalDistanceTraveled: toSafeNumber(entry?.totalDistanceTraveled),
        totalFuelConsumed: toSafeNumber(entry?.totalFuelConsumed),
        totalEngineHours: toSafeNumber(entry?.totalEngineHours),
        refillCount: Math.max(0, Math.trunc(toSafeNumber(entry?.refillCount))),
        theftCount: Math.max(0, Math.trunc(toSafeNumber(entry?.theftCount))),
      }))
    : [];

  const previewFuelEvents = Array.isArray(preview.fuelEvents)
    ? preview.fuelEvents.map((entry: any) => ({
        registrationNumber: entry?.registrationNumber ? String(entry.registrationNumber) : null,
        eventType: toSafeString(entry?.eventType),
        volumeLiters: toSafeNumber(entry?.volumeLiters),
        eventTime: entry?.eventTime ? String(entry.eventTime) : null,
        location: entry?.location ? String(entry.location) : null,
      }))
    : [];

  return {
    mode: raw.mode === "apply" ? "apply" : "preview",
    fingerprint: toSafeString(raw.fingerprint),
    detectedReportType: toSafeString(raw.detectedReportType, "unknown"),
    fileName: toSafeString(raw.fileName),
    period: {
      startDate: toSafeString(period.startDate, "-"),
      endDate: toSafeString(period.endDate, "-"),
    },
    assets: {
      inFile: Math.max(0, Math.trunc(toSafeNumber(assets.inFile))),
      matched: Math.max(0, Math.trunc(toSafeNumber(assets.matched))),
      unmatched: toSafeStringArray(assets.unmatched),
    },
    rows: {
      inFile: Math.max(0, Math.trunc(toSafeNumber(rows.inFile))),
      matched: Math.max(0, Math.trunc(toSafeNumber(rows.matched))),
    },
    tables: {
      tripReports: {
        deleted: Math.max(0, Math.trunc(toSafeNumber(tableTrip.deleted))),
        inserted: Math.max(0, Math.trunc(toSafeNumber(tableTrip.inserted))),
      },
      dailyMetrics: {
        deleted: Math.max(0, Math.trunc(toSafeNumber(tableDaily.deleted))),
        inserted: Math.max(0, Math.trunc(toSafeNumber(tableDaily.inserted))),
      },
      fuelEvents: {
        deleted: Math.max(0, Math.trunc(toSafeNumber(tableFuel.deleted))),
        inserted: Math.max(0, Math.trunc(toSafeNumber(tableFuel.inserted))),
      },
    },
    preview: {
      tripReports: previewTripReports,
      dailyMetrics: previewDailyMetrics,
      fuelEvents: previewFuelEvents,
    },
    notes: toSafeStringArray(raw.notes),
  };
}

export function AdminPage({ pageId = "admin" }: AdminPageProps) {
  const { isAdmin, user: authUser } = useAuth();
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "client">("client");
  const [userDisplayName, setUserDisplayName] = useState("");
  const [newUserClientIds, setNewUserClientIds] = useState<string[]>([]);
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userDirectoryRoleFilter, setUserDirectoryRoleFilter] = useState<"all" | "admin" | "client">("all");
  const [hiddenDeletedUserIds, setHiddenDeletedUserIds] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceResult, setSourceResult] = useState<SourceOfTruthResult | null>(null);
  const [sourceUploadBusy, setSourceUploadBusy] = useState(false);
  const [sourcePreviewBusy, setSourcePreviewBusy] = useState(false);
  const [sourceApplyConfirm, setSourceApplyConfirm] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["/api/admin/clients"],
    queryFn: () => api.getAdminClients(),
  });

  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: () => api.getAdminUsers(),
  });

  const visibleUsers = useMemo(
    () => (users || []).filter((user: any) => Boolean(user?.id) && !hiddenDeletedUserIds.includes(user.id)),
    [users, hiddenDeletedUserIds]
  );

  const filteredVisibleUsers = useMemo(() => {
    const search = userSearchTerm.trim().toLowerCase();

    return visibleUsers.filter((user: any) => {
      const matchesRole = userDirectoryRoleFilter === "all" ? true : user.role === userDirectoryRoleFilter;
      if (!matchesRole) return false;

      if (!search) return true;

      const haystack = [user.displayName, user.email, ...(user.clientIds || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [visibleUsers, userDirectoryRoleFilter, userSearchTerm]);

  const safeClients = (clients || []).filter((client: any) => Boolean(client?.id));
  const clientsWithVehicles = safeClients;

  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ["/api/admin/assignments", selectedUserId],
    queryFn: () => api.getAdminAssignments({ userId: selectedUserId || "" }),
    enabled: Boolean(selectedUserId),
  });

  useEffect(() => {
    if (!selectedUserId && visibleUsers.length > 0 && visibleUsers[0]?.id) {
      setSelectedUserId(visibleUsers[0].id);
    }
  }, [selectedUserId, visibleUsers]);

  const showError = (title: string, error: unknown) => {
    const description = error instanceof Error ? error.message : String(error);
    toast({
      variant: "destructive",
      title,
      description,
    });
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader pageId={pageId} />
        <GlassCard className="p-6" hover={false}>
          <h2 className="text-lg font-semibold">Admin Access Required</h2>
          <p className="text-sm text-muted-foreground">
            You do not have permission to view this page.
          </p>
        </GlassCard>
      </div>
    );
  }

  const handleCreateUser = async () => {
    if (!userEmail || !userPassword) return;
    try {
      await api.createAdminUser({
        email: userEmail,
        password: userPassword,
        role: userRole,
        displayName: userDisplayName || userEmail,
        clientIds: newUserClientIds,
      });
      setUserEmail("");
      setUserPassword("");
      setUserRole("client");
      setUserDisplayName("");
      setNewUserClientIds([]);
      setShowCreateUserForm(false);
      refetchUsers();
    } catch (error) {
      showError("Failed to create user", error);
    }
  };

  const handleAssignClient = async () => {
    if (!selectedUserId || !selectedClientId) return;
    if (assignments.some((assignment: any) => assignment.client_id === selectedClientId)) {
      toast({
        title: "Client already assigned",
        description: "This user already has access to the selected client.",
      });
      return;
    }
    try {
      await api.createAdminAssignment({ userId: selectedUserId, clientId: selectedClientId });
      setSelectedClientId(null);
      refetchAssignments();
      refetchUsers();
    } catch (error) {
      showError("Failed to assign client", error);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      await api.deleteAdminAssignment(assignmentId);
      refetchAssignments();
      refetchUsers();
    } catch (error) {
      showError("Failed to remove assignment", error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const targetUser = visibleUsers.find((user: any) => user.id === userId);
    if (!targetUser) return;
    if (!window.confirm(`Delete ${targetUser.displayName || targetUser.email} permanently? This removes profile access and client assignments.`)) {
      return;
    }

    try {
      await api.deleteAdminUser(userId);
      setHiddenDeletedUserIds((current) => [...current, userId]);
      if (selectedUserId === userId) {
        setSelectedUserId(null);
      }
      refetchAssignments();
      refetchUsers();
      toast({
        title: "User deleted",
        description: `${targetUser.displayName || targetUser.email} was removed successfully.`,
      });
    } catch (error) {
      showError("Failed to delete user", error);
    }
  };

  const handleSourceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setSourceFile(nextFile);
    setSourceResult(null);
    setSourceApplyConfirm("");
  };

  const handleSourcePreview = async () => {
    if (!sourceFile) {
      toast({
        variant: "destructive",
        title: "No file selected",
        description: "Choose a CSV or XLSX file to continue.",
      });
      return;
    }

    try {
      setSourcePreviewBusy(true);
      const formData = new FormData();
      formData.append("file", sourceFile);
      const rawResult = await api.previewAdminSourceOfTruth(formData);
      const result = normalizeSourceOfTruthResult(rawResult);
      setSourceResult(result);
      toast({
        title: "Preview ready",
        description: `${result.rows.matched} row(s) mapped for ${result.assets.matched} matched asset(s). No data written.`,
      });
    } catch (error) {
      showError("Preview failed", error);
    } finally {
      setSourcePreviewBusy(false);
    }
  };

  const handleSourceUpload = async () => {
    if (!sourceFile) {
      toast({
        variant: "destructive",
        title: "No file selected",
        description: "Choose a CSV or XLSX file to continue.",
      });
      return;
    }

    if (!sourceResult || sourceResult.mode !== "preview") {
      toast({
        variant: "destructive",
        title: "Preview required",
        description: "Run Preview Mapping first, then confirm apply.",
      });
      return;
    }

    if (sourceResult.fileName !== sourceFile.name) {
      toast({
        variant: "destructive",
        title: "File changed",
        description: "The selected file differs from preview. Run Preview Mapping again.",
      });
      return;
    }

    if (sourceApplyConfirm.trim().toUpperCase() !== "APPLY") {
      toast({
        variant: "destructive",
        title: "Confirmation required",
        description: "Type APPLY to confirm destructive replacement.",
      });
      return;
    }

    try {
      setSourceUploadBusy(true);
      const formData = new FormData();
      formData.append("file", sourceFile);
      formData.append("expectedFingerprint", sourceResult.fingerprint);
      const rawResult = await api.uploadAdminSourceOfTruth(formData);
      const result = normalizeSourceOfTruthResult(rawResult);
      setSourceResult(result);
      setSourceApplyConfirm("");
      toast({
        title: "Source-of-truth backfill completed",
        description: `${result.rows.matched} row(s) processed for ${result.assets.matched} matched asset(s).`,
      });
    } catch (error) {
      showError("Backfill failed", error);
    } finally {
      setSourceUploadBusy(false);
    }
  };

  const renderableSourceResult = Boolean(
    sourceResult &&
    (sourceResult as any).period &&
    (sourceResult as any).assets &&
    (sourceResult as any).rows &&
    (sourceResult as any).tables &&
    (sourceResult as any).preview
  );

  const selectedUser = visibleUsers.find((user: any) => user.id === selectedUserId) || null;
  const adminCount = visibleUsers.filter((user: any) => user.role === "admin").length;
  const clientUserCount = visibleUsers.filter((user: any) => user.role !== "admin").length;
  const assignedCount = assignments.length;

  return (
    <div className="space-y-6">
      <PageHeader pageId={pageId} />
      <GlassCard className="overflow-hidden border-border/50 bg-card/50 p-0" hover={false}>
        <div className="grid gap-px bg-border/30 md:grid-cols-4">
          <div className="bg-background/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Building2 className="h-4 w-4" />
              Client Registry
            </div>
            <div className="mt-3 text-3xl font-semibold">{clientsWithVehicles.length}</div>
            <div className="mt-1 text-sm text-muted-foreground">Active client scopes derived from fleet data.</div>
          </div>
          <div className="bg-background/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Users className="h-4 w-4" />
              User Accounts
            </div>
            <div className="mt-3 text-3xl font-semibold">{visibleUsers.length}</div>
            <div className="mt-1 text-sm text-muted-foreground">{clientUserCount} client users and {adminCount} admins.</div>
          </div>
          <div className="bg-background/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Link2 className="h-4 w-4" />
              Access Links
            </div>
            <div className="mt-3 text-3xl font-semibold">{assignedCount}</div>
            <div className="mt-1 text-sm text-muted-foreground">Assignments for the currently selected user.</div>
          </div>
          <div className="bg-background/80 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Database className="h-4 w-4" />
              Data Control
            </div>
            <div className="mt-3 text-3xl font-semibold">{sourceResult?.rows?.matched ?? 0}</div>
            <div className="mt-1 text-sm text-muted-foreground">Rows staged in the latest source-of-truth preview.</div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-0" hover={false}>
        <Accordion type="multiple" defaultValue={["clients", "users"]} className="w-full">
          <AccordionItem value="clients" className="border-border/30 px-5">
            <AccordionTrigger className="py-4 text-left hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-border/40 bg-background/70 p-2">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-base font-semibold">Client Registry</div>
                  <div className="text-sm font-normal text-muted-foreground">
                    View the active client scopes automatically discovered from vehicle ownership data.
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <div className="rounded-xl border border-border/30 bg-background/60 p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">Detected clients</div>
                  <Badge variant="outline">{clientsWithVehicles.length} active</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  {clientsWithVehicles.map((client: any) => (
                    <div key={client.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-card/30 px-2.5 py-1.5">
                      <span className="font-medium">{client.name}</span>
                      <span className="text-xs text-muted-foreground">{client.id}</span>
                    </div>
                  ))}
                  {clientsWithVehicles.length === 0 && (
                    <div className="text-xs text-muted-foreground">No clients detected from vehicles yet.</div>
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="users" className="border-border/30 px-5">
            <AccordionTrigger className="py-4 text-left hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-border/40 bg-background/70 p-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-base font-semibold">User Provisioning</div>
                  <div className="text-sm font-normal text-muted-foreground">
                    Create admin or client accounts and attach their initial client access in one step.
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3 rounded-xl border border-border/30 bg-background/60 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Create account</div>
                      <div className="text-xs text-muted-foreground">Open the provisioning form only when you want to add a new user.</div>
                    </div>
                    <Button
                      variant={showCreateUserForm ? "outline" : "default"}
                      size="sm"
                      onClick={() => setShowCreateUserForm((current) => !current)}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      {showCreateUserForm ? "Hide Form" : "Create User"}
                    </Button>
                  </div>
                  {!showCreateUserForm ? (
                    <div className="rounded-lg border border-dashed border-border/30 px-3 py-4 text-sm text-muted-foreground">
                      The provisioning form stays hidden until you click <span className="font-medium text-foreground">Create User</span>.
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="user-email">Email</Label>
                          <Input id="user-email" type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="user@company.com" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="user-password">Password</Label>
                          <Input id="user-password" type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="user-display">Display Name</Label>
                          <Input id="user-display" value={userDisplayName} onChange={(e) => setUserDisplayName(e.target.value)} placeholder="Jane Doe" />
                        </div>
                        <div className="space-y-2">
                          <Label>User Role</Label>
                          <Select value={userRole} onValueChange={(value) => setUserRole(value as "admin" | "client")}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="client">Client User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Initial Client Access</Label>
                        <div className="grid gap-1.5 rounded-xl border border-border/20 bg-card/20 p-2.5 md:grid-cols-2">
                          {clientsWithVehicles.map((client: any) => {
                            const checked = newUserClientIds.includes(client.id);
                            return (
                              <label key={client.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-background/60">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewUserClientIds((prev) => [...prev, client.id]);
                                    } else {
                                      setNewUserClientIds((prev) => prev.filter((id) => id !== client.id));
                                    }
                                  }}
                                />
                                <span>{client.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={handleCreateUser}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Create User
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-border/30 bg-background/60 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Account posture</div>
                      <div className="text-xs text-muted-foreground">At-a-glance view of the current admin estate.</div>
                    </div>
                    <Badge variant="outline">{visibleUsers.length} total</Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="rounded-lg border border-border/20 bg-card/25 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Administrators</span>
                        <ShieldCheck className="h-4 w-4 text-primary" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{adminCount}</div>
                    </div>
                    <div className="rounded-lg border border-border/20 bg-card/25 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Client users</span>
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{clientUserCount}</div>
                    </div>
                    <div className="rounded-lg border border-border/20 bg-card/25 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Client scopes</span>
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="mt-2 text-2xl font-semibold">{clientsWithVehicles.length}</div>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="access" className="border-border/30 px-5">
            <AccordionTrigger className="py-4 text-left hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-border/40 bg-background/70 p-2">
                  <UserCog className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-base font-semibold">User Access Management</div>
                  <div className="text-sm font-normal text-muted-foreground">
                    Review every user, assign or revoke client access, and remove obsolete accounts cleanly.
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-xl border border-border/30 bg-background/60 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-medium">User directory</div>
                    <Badge variant="outline">{filteredVisibleUsers.length} users</Badge>
                  </div>
                  <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                    <Input
                      value={userSearchTerm}
                      onChange={(event) => setUserSearchTerm(event.target.value)}
                      placeholder="Search by name or email"
                      className="h-8"
                    />
                    <Select
                      value={userDirectoryRoleFilter}
                      onValueChange={(value) => setUserDirectoryRoleFilter(value as "all" | "admin" | "client")}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="All roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All roles</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center justify-end">
                      {(userSearchTerm || userDirectoryRoleFilter !== "all") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setUserSearchTerm("");
                            setUserDirectoryRoleFilter("all");
                          }}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
                    {filteredVisibleUsers.map((user: any) => (
                      <button
                        type="button"
                        key={user.id}
                        onClick={() => setSelectedUserId(user.id)}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          selectedUserId === user.id ? "border-primary/40 bg-primary/8" : "border-border/20 bg-card/20"
                        }`}
                      >
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.35fr)_auto_auto_auto] sm:items-center">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{user.displayName || user.email}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge variant={user.role === "admin" ? "default" : "outline"} className="px-2 py-0 text-[10px]">
                              {user.role}
                            </Badge>
                            <Badge variant="outline" className="px-2 py-0 text-[10px]">
                              {user.clientIds?.length || 0} scopes
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between gap-2 sm:justify-end">
                            <div className="text-[11px] text-muted-foreground">
                              {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB") : "-"}
                            </div>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteUser(user.id);
                            }}
                            disabled={authUser?.id === user.id}
                            className="min-h-7 whitespace-nowrap px-2.5 text-[11px] sm:justify-self-end"
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Delete User
                          </Button>
                        </div>
                      </button>
                    ))}
                    {filteredVisibleUsers.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border/30 px-3 py-4 text-sm text-muted-foreground">
                        No users match the current search or role filter.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border/30 bg-background/60 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Access control</div>
                      <div className="text-xs text-muted-foreground">
                        {selectedUser ? `Managing ${selectedUser.displayName || selectedUser.email}` : "Select a user to manage client access."}
                      </div>
                    </div>
                    {selectedUser ? <Badge variant="outline">{assignments.length} assignments</Badge> : null}
                  </div>
                  {selectedUser ? (
                    <>
                      <div className="space-y-2.5">
                        <div className="space-y-2">
                          <Label>Select Client</Label>
                          <Select value={selectedClientId || ""} onValueChange={(value) => setSelectedClientId(value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a client" />
                            </SelectTrigger>
                            <SelectContent>
                              {clientsWithVehicles.map((client: any) => (
                                <SelectItem key={client.id} value={client.id}>
                                  {client.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button onClick={handleAssignClient} disabled={!selectedClientId}>
                          <Link2 className="mr-2 h-4 w-4" />
                          Assign Client
                        </Button>
                      </div>

                      <div className="mt-5 max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                        {assignments.map((assignment: any) => (
                          <div key={assignment.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-card/20 px-2.5 py-1.5">
                            <div className="text-sm">{assignment.clients?.name || assignment.client_id}</div>
                            <Button variant="outline" size="sm" onClick={() => handleRemoveAssignment(assignment.id)}>
                              Remove
                            </Button>
                          </div>
                        ))}
                        {assignments.length === 0 && (
                          <div className="rounded-lg border border-dashed border-border/30 px-3 py-3 text-sm text-muted-foreground">
                            No assignments yet for this user.
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/30 px-3 py-5 text-sm text-muted-foreground">
                      Select a user from the directory to manage client assignments or remove the account.
                    </div>
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="source" className="border-border/30 px-5">
            <AccordionTrigger className="py-4 text-left hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-border/40 bg-background/70 p-2">
                  <Database className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-base font-semibold">Source Of Truth Backfill</div>
                  <div className="text-sm font-normal text-muted-foreground">
                    Controlled backfill tooling for replacing period data using validated CSV or XLSX source files.
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <div className="rounded-xl border border-border/30 bg-background/60 p-3.5">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Source Of Truth Backfill
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload telemetry export files (CSV/XLSX). The system detects report headers and replaces
              existing period data for matched assets with recalculated values.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="source-truth-file">Upload Source File</Label>
            <Input
              id="source-truth-file"
              type="file"
              accept=".csv,.xlsx,.xlsm"
              onChange={handleSourceFileChange}
              data-testid="input-source-truth-file"
            />
            <div className="text-xs text-muted-foreground">
              Supported now: Fuel trip listing and Daily Movement trip report formats (CSV/XLSX).
            </div>
          </div>
          <div className="flex flex-col sm:flex-row xl:flex-col gap-2">
            <Button
              onClick={handleSourcePreview}
              disabled={sourcePreviewBusy || sourceUploadBusy || !sourceFile}
              variant="outline"
              className="min-w-[190px]"
              data-testid="button-source-truth-preview"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              {sourcePreviewBusy ? "Previewing..." : "Preview Mapping"}
            </Button>
            <Button
              onClick={handleSourceUpload}
              disabled={
                sourceUploadBusy ||
                sourcePreviewBusy ||
                !sourceFile ||
                !sourceResult ||
                sourceResult.mode !== "preview" ||
                sourceResult.fileName !== sourceFile.name
              }
              className="min-w-[190px]"
              data-testid="button-source-truth-upload"
            >
              <UploadCloud className="w-4 h-4 mr-2" />
              {sourceUploadBusy ? "Processing..." : "Replace With Source"}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-2">
            <Label htmlFor="source-apply-confirm">Destructive Apply Confirmation</Label>
            <Input
              id="source-apply-confirm"
              value={sourceApplyConfirm}
              onChange={(event) => setSourceApplyConfirm(event.target.value)}
              placeholder='Type "APPLY" after preview to enable replacement'
              data-testid="input-source-apply-confirm"
            />
            <div className="text-xs text-muted-foreground">
              Apply runs only against the exact file/fingerprint previewed.
            </div>
          </div>
        </div>

        {sourceFile && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border/30 bg-card/30 px-3 py-2 text-xs">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">{sourceFile.name}</span>
            <span className="text-muted-foreground">({Math.max(1, Math.round(sourceFile.size / 1024))} KB)</span>
          </div>
        )}

        {sourceResult && !renderableSourceResult && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            Source preview payload is incomplete. Please run Preview Mapping again.
          </div>
        )}

        {renderableSourceResult && sourceResult && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/30 bg-card/20 p-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detection</div>
              <div className="text-sm"><span className="text-muted-foreground">File:</span> {sourceResult.fileName}</div>
              <div className="text-sm">
                <span className="text-muted-foreground">Mode:</span>{" "}
                <span className={sourceResult.mode === "preview" ? "font-semibold text-primary" : "font-semibold text-foreground"}>
                  {sourceResult.mode === "preview" ? "Preview (no write)" : "Applied (written)"}
                </span>
              </div>
              <div className="text-sm"><span className="text-muted-foreground">Report:</span> {sourceResult.detectedReportType}</div>
              <div className="text-sm">
                <span className="text-muted-foreground">Period:</span> {sourceResult.period?.startDate ?? "-"} to {sourceResult.period?.endDate ?? "-"}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Rows:</span> {sourceResult.rows.matched} / {sourceResult.rows.inFile} matched
              </div>
            </div>

            <div className="rounded-lg border border-border/30 bg-card/20 p-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assets</div>
              <div className="text-sm"><span className="text-muted-foreground">In file:</span> {sourceResult.assets.inFile}</div>
              <div className="text-sm"><span className="text-muted-foreground">Matched:</span> {sourceResult.assets.matched}</div>
              <div className="text-sm"><span className="text-muted-foreground">Unmatched:</span> {sourceResult.assets.unmatched.length}</div>
              {sourceResult.assets.unmatched.length > 0 && (
                <div className="text-xs text-destructive">
                  {sourceResult.assets.unmatched.slice(0, 6).join(", ")}
                  {sourceResult.assets.unmatched.length > 6 ? ` +${sourceResult.assets.unmatched.length - 6} more` : ""}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/30 bg-card/20 p-4 lg:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Table Replacement</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md bg-background/40 border border-border/20 p-3">
                  <div className="font-medium">Trip Reports</div>
                  <div className="text-muted-foreground">Deleted: {sourceResult.tables.tripReports.deleted}</div>
                  <div className="font-semibold">Inserted: {sourceResult.tables.tripReports.inserted}</div>
                </div>
                <div className="rounded-md bg-background/40 border border-border/20 p-3">
                  <div className="font-medium">Daily Metrics</div>
                  <div className="text-muted-foreground">Deleted: {sourceResult.tables.dailyMetrics.deleted}</div>
                  <div className="font-semibold">Inserted: {sourceResult.tables.dailyMetrics.inserted}</div>
                </div>
                <div className="rounded-md bg-background/40 border border-border/20 p-3">
                  <div className="font-medium">Fuel Events</div>
                  <div className="text-muted-foreground">Deleted: {sourceResult.tables.fuelEvents.deleted}</div>
                  <div className="font-semibold">Inserted: {sourceResult.tables.fuelEvents.inserted}</div>
                </div>
              </div>
              {sourceResult.notes.length > 0 && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Notes: {sourceResult.notes.slice(0, 3).join(" | ")}
                  {sourceResult.notes.length > 3 ? ` +${sourceResult.notes.length - 3} more` : ""}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/30 bg-card/20 p-4 lg:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Mapping Preview (live rows)
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md bg-background/40 border border-border/20 p-3 space-y-2">
                  <div className="font-medium">Trip Reports</div>
                  {sourceResult.preview.tripReports.length === 0 && (
                    <div className="text-xs text-muted-foreground">No preview rows.</div>
                  )}
                  {sourceResult.preview.tripReports.map((row, index) => (
                    <div key={`${row.sourceTripKey || index}`} className="text-xs border border-border/15 rounded p-2 bg-card/30">
                      <div className="font-medium">{row.registrationNumber || "Unknown asset"}</div>
                      <div className="text-muted-foreground">{row.departureTime || "-"} to {row.arrivalTime || "-"}</div>
                      <div>{Number(row.distanceKm || 0).toFixed(2)} km | {row.fuelUsedLitres ?? "N/A"} L</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-md bg-background/40 border border-border/20 p-3 space-y-2">
                  <div className="font-medium">Daily Metrics</div>
                  {sourceResult.preview.dailyMetrics.length === 0 && (
                    <div className="text-xs text-muted-foreground">No preview rows.</div>
                  )}
                  {sourceResult.preview.dailyMetrics.map((row, index) => (
                    <div key={`${row.metricDay}-${row.registrationNumber || index}`} className="text-xs border border-border/15 rounded p-2 bg-card/30">
                      <div className="font-medium">{row.registrationNumber || "Unknown asset"}</div>
                      <div className="text-muted-foreground">{row.metricDay}</div>
                      <div>{row.totalDistanceTraveled.toFixed(2)} km | {row.totalFuelConsumed.toFixed(2)} L</div>
                      <div>Refills {row.refillCount} | Thefts {row.theftCount}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-md bg-background/40 border border-border/20 p-3 space-y-2">
                  <div className="font-medium">Fuel Events</div>
                  {sourceResult.preview.fuelEvents.length === 0 && (
                    <div className="text-xs text-muted-foreground">No preview rows.</div>
                  )}
                  {sourceResult.preview.fuelEvents.map((row, index) => (
                    <div key={`${row.registrationNumber || "asset"}-${row.eventTime || index}-${row.eventType}`} className="text-xs border border-border/15 rounded p-2 bg-card/30">
                      <div className="font-medium">{row.registrationNumber || "Unknown asset"}</div>
                      <div className="text-muted-foreground">{row.eventTime || "-"}</div>
                      <div className="capitalize">{row.eventType} | {row.volumeLiters.toFixed(2)} L</div>
                      <div className="text-muted-foreground truncate">{row.location || "-"}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </GlassCard>
    </div>
  );
}
