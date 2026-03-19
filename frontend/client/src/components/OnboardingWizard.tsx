import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "./GlassCard";
import { supabase } from "@/lib/supabaseClient";
import { config } from "@/lib/config";

interface OnboardingWizardProps {
  onComplete?: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clientName, setClientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const baseUrl = (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");

  const handleBootstrap = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${baseUrl}/api/onboarding/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName, clientName }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to bootstrap admin");
      }

      await supabase.auth.signInWithPassword({ email, password });
      onComplete?.();
    } catch (err: any) {
      setError(err.message || "Failed to complete onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <GlassCard className="w-full max-w-lg p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Welcome to Teletrac Fuel</h1>
          <p className="text-sm text-muted-foreground">Let's set up your platform</p>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Admin Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Admin Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-display">Display Name</Label>
              <Input
                id="admin-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Platform Admin"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!email || !password}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Client Name</Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Your primary client"
              />
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleBootstrap} disabled={submitting || !clientName}>
                {submitting ? "Creating..." : "Finish Setup"}
              </Button>
            </div>
          </div>
        )}

        {error && <div className="mt-4 text-sm text-destructive">{error}</div>}
      </GlassCard>
    </div>
  );
}

