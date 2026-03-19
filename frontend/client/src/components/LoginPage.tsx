import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "./GlassCard";
import { useAuth } from "./AuthProvider";
import { useBrandingLogo } from "@/hooks/use-branding-logo";

export function LoginPage() {
  const { signIn } = useAuth();
  const { logoSrc } = useBrandingLogo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn(email, password);
    if (result?.error) {
      setError(result.error);
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <GlassCard className="w-full max-w-md p-8" hover={false}>
        <div className="mb-6">
          <div className="w-44 h-16 rounded-md bg-white border border-border/30 shadow-sm flex items-center justify-center p-2 mb-4">
            <img
              src={logoSrc}
              alt="Teletrac Fuel logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-semibold">Teletrac Fuel</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}

