import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "./GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "./AuthProvider";
import { api } from "@/lib/api";
import { PageHeader } from "./PageHeader";

interface AdminPageProps {
  pageId?: string;
}

export function AdminPage({ pageId = "admin" }: AdminPageProps) {
  const { isAdmin } = useAuth();
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "client">("client");
  const [userDisplayName, setUserDisplayName] = useState("");
  const [newUserClientIds, setNewUserClientIds] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["/api/admin/clients"],
    queryFn: () => api.getAdminClients(),
  });

  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: () => api.getAdminUsers(),
  });

  const safeClients = (clients || []).filter((client: any) => Boolean(client?.id));
  const clientsWithVehicles = safeClients;

  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ["/api/admin/assignments", selectedUserId],
    queryFn: () => api.getAdminAssignments({ userId: selectedUserId || "" }),
    enabled: Boolean(selectedUserId),
  });

  useEffect(() => {
    if (!selectedUserId && users.length > 0 && users[0]?.id) {
      setSelectedUserId(users[0].id);
    }
  }, [selectedUserId, users]);

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

  return (
    <div className="space-y-6">
      <PageHeader pageId={pageId} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6" hover={false}>
          <h2 className="text-lg font-semibold mb-4">Clients (Auto from Vehicles)</h2>
          <p className="text-sm text-muted-foreground">
            Clients are derived from vehicle data. Manual client creation is disabled.
          </p>
          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Active Clients</h3>
            <div className="space-y-2 text-sm">
              {clientsWithVehicles.map((client: any) => (
                <div key={client.id} className="flex items-center justify-between">
                  <span>{client.name}</span>
                  <span className="text-xs text-muted-foreground">{client.id}</span>
                </div>
              ))}
              {clientsWithVehicles.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  No clients detected from vehicles yet.
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6" hover={false}>
          <h2 className="text-lg font-semibold mb-4">Create User</h2>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="user@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">Password</Label>
              <Input
                id="user-password"
                type="password"
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-display">Display Name</Label>
              <Input
                id="user-display"
                value={userDisplayName}
                onChange={(e) => setUserDisplayName(e.target.value)}
                placeholder="Jane Doe"
              />
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
            <div className="space-y-2">
              <Label>Assign Clients</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto border border-border/20 rounded-md p-2">
                {clientsWithVehicles.map((client: any) => {
                  const checked = newUserClientIds.includes(client.id);
                  return (
                    <label key={client.id} className="flex items-center gap-2 text-sm">
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
                {clientsWithVehicles.length === 0 && (
                  <div className="text-xs text-muted-foreground">No clients available from vehicles.</div>
                )}
              </div>
            </div>
            <Button onClick={handleCreateUser}>Create User</Button>
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6" hover={false}>
          <h2 className="text-lg font-semibold mb-4">Users</h2>
          <div className="space-y-3">
            {users.map((user: any) => (
              <div
                key={user.id}
                className={`p-3 rounded-lg border border-border/30 cursor-pointer ${
                  selectedUserId === user.id ? "bg-primary/10" : "bg-card/20"
                }`}
                onClick={() => setSelectedUserId(user.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{user.displayName || user.email}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                  <div className="text-xs font-medium">{user.role}</div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Assigned Clients: {user.clientIds?.length || 0}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-6" hover={false}>
          <h2 className="text-lg font-semibold mb-4">Assignments</h2>
          {selectedUserId ? (
            <>
              <div className="space-y-3">
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
                  Assign Client
                </Button>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Current Assignments</h3>
                <div className="space-y-2">
                  {assignments.map((assignment: any) => (
                    <div key={assignment.id} className="flex items-center justify-between p-2 border border-border/20 rounded-lg">
                      <div className="text-sm">
                        {assignment.clients?.name || assignment.client_id}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveAssignment(assignment.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  {assignments.length === 0 && (
                    <div className="text-sm text-muted-foreground">No assignments yet.</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Select a user to manage assignments.</div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
