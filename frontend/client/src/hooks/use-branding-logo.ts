import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import teletracLogo from "@/assets/teletrac-logo.png";
import { useAuth } from "@/components/AuthProvider";
import { useGlobalFilter } from "@/components/GlobalFilterContext";
import { api } from "@/lib/api";
import {
  BRAND_LOGO_UPDATED_EVENT,
  getStoredBrandLogo,
  resolveBrandingClientId,
  setStoredBrandLogo,
} from "@/lib/branding";

type BrandingLogoResponse = {
  clientId: string | null;
  logoUrl: string | null;
  updatedAt?: string | null;
  requiresClientSelection?: boolean;
};

export function useBrandingLogo() {
  const { state } = useGlobalFilter();
  const { clientIds } = useAuth();

  const brandingClientId = useMemo(
    () => resolveBrandingClientId(state.selectedClientId, clientIds),
    [state.selectedClientId, clientIds]
  );

  const [logoSrc, setLogoSrc] = useState<string>(() => getStoredBrandLogo(brandingClientId) || teletracLogo);

  useEffect(() => {
    setLogoSrc(getStoredBrandLogo(brandingClientId) || teletracLogo);
  }, [brandingClientId]);

  const brandingQuery = useQuery<BrandingLogoResponse>({
    queryKey: ["/api/settings/branding/logo", brandingClientId ?? "none"],
    enabled: Boolean(brandingClientId),
    queryFn: () => api.getBrandingLogo({ clientId: brandingClientId || undefined }),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!brandingClientId) {
      setLogoSrc(teletracLogo);
      return;
    }
    if (!brandingQuery.isSuccess) return;

    const persistedLogoUrl = brandingQuery.data?.logoUrl ?? null;
    setStoredBrandLogo(persistedLogoUrl, brandingClientId);
    setLogoSrc(persistedLogoUrl || teletracLogo);
  }, [brandingClientId, brandingQuery.data?.logoUrl, brandingQuery.isSuccess]);

  useEffect(() => {
    const syncLogo = () => {
      setLogoSrc(getStoredBrandLogo(brandingClientId) || teletracLogo);
    };

    syncLogo();
    window.addEventListener(BRAND_LOGO_UPDATED_EVENT, syncLogo as EventListener);
    window.addEventListener("storage", syncLogo);
    return () => {
      window.removeEventListener(BRAND_LOGO_UPDATED_EVENT, syncLogo as EventListener);
      window.removeEventListener("storage", syncLogo);
    };
  }, [brandingClientId]);

  return {
    logoSrc,
    brandingClientId,
    requiresClientSelection:
      !brandingClientId && (state.selectedClientId === "all" || !state.selectedClientId) && clientIds.length !== 1,
  };
}
