import { useState } from "react";
import { Activity, Droplets, ShieldCheck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "./GlassCard";
import { useAuth } from "./AuthProvider";
import { useBrandingLogo } from "@/hooks/use-branding-logo";

export function LoginPage() {
  const { signIn } = useAuth();
  const { logoSrc } = useBrandingLogo({ preferAnyStoredLogo: true });
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
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_34%),linear-gradient(145deg,rgba(8,15,27,1)_0%,rgba(12,22,38,1)_42%,rgba(16,33,48,1)_100%)] text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.05),transparent_24%,transparent_76%,rgba(255,255,255,0.04))]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-white/6 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl lg:p-10">
            <div className="absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.16),transparent_55%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.18),transparent_60%)]" />
            <div className="relative max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200">
                Fuel Intelligence Platform
              </div>
              <div className="mb-8 w-48 rounded-2xl bg-white/95 p-3 shadow-lg shadow-black/20">
                <img
                  src={logoSrc}
                  alt="Teletrac Fuel logo"
                  className="h-14 w-full object-contain"
                />
              </div>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
                Turn every litre, trip, and anomaly into operational fuel insight.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-200 sm:text-lg">
                Monitor refills, detect theft patterns, compare consumption trends, and keep every fleet decision grounded in live fuel analysis.
              </p>
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-md">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/15 text-sky-200">
                    <Droplets className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-white">Fuel level intelligence</div>
                  <div className="mt-1 text-sm leading-6 text-slate-300">
                    Track actual tank behavior, refill events, and suspicious drain patterns across the fleet.
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-md">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-200">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-white">Consumption analysis</div>
                  <div className="mt-1 text-sm leading-6 text-slate-300">
                    Compare fuel used against distance and engine hours to spot underperforming assets fast.
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-md">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-200">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-white">Live fleet visibility</div>
                  <div className="mt-1 text-sm leading-6 text-slate-300">
                    See asset movement, idling, and latest telemetry in one operational fuel command view.
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-md">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/15 text-violet-200">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-white">Trusted reporting</div>
                  <div className="mt-1 text-sm leading-6 text-slate-300">
                    Generate clean operational reporting for finance, transport, and compliance teams from one source.
                  </div>
                </div>
              </div>
            </div>
          </div>
          <GlassCard className="w-full self-center rounded-[2rem] border-white/12 bg-slate-950/55 p-8 shadow-2xl shadow-black/30 lg:p-10" hover={false}>
            <div className="mb-8">
              <div className="text-sm font-medium uppercase tracking-[0.18em] text-sky-200">Secure Access</div>
              <h2 className="mt-3 text-3xl font-semibold text-white">Sign in to your fuel workspace</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Access live fleet fuel analysis, refill intelligence, theft detection, and historical reporting from one platform.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-200">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-200">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-400"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="h-11 w-full border border-sky-300/20 bg-[linear-gradient(135deg,rgba(14,165,233,1),rgba(37,99,235,1))] text-white shadow-lg shadow-sky-950/40 hover:opacity-95"
                disabled={submitting}
              >
                {submitting ? "Signing in..." : "Enter Platform"}
              </Button>
            </form>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

