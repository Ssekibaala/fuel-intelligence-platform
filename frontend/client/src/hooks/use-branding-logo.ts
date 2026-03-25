import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { useGlobalFilter } from "@/components/GlobalFilterContext";
import { api } from "@/lib/api";
import {
  BRAND_LOGO_UPDATED_EVENT,
  getAnyStoredBrandLogo,
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

type UseBrandingLogoOptions = {
  preferAnyStoredLogo?: boolean;
};

export function useBrandingLogo(options: UseBrandingLogoOptions = {}) {
  const { state } = useGlobalFilter();
  const { clientIds } = useAuth();
  const { preferAnyStoredLogo = false } = options;

  const brandingClientId = useMemo(
    () => resolveBrandingClientId(state.selectedClientId, clientIds),
    [state.selectedClientId, clientIds]
  );

  const resolveInitialLogo = () =>
    getStoredBrandLogo(brandingClientId)
    || (preferAnyStoredLogo ? getAnyStoredBrandLogo() : null);

  const [logoSrc, setLogoSrc] = useState<string | null>(resolveInitialLogo);

  useEffect(() => {
    setLogoSrc(
      getStoredBrandLogo(brandingClientId)
      || (preferAnyStoredLogo ? getAnyStoredBrandLogo() : null)
      || null
    );
  }, [brandingClientId, preferAnyStoredLogo]);

  const brandingQuery = useQuery<BrandingLogoResponse>({
    queryKey: ["/api/settings/branding/logo", brandingClientId ?? "none"],
    enabled: Boolean(brandingClientId),
    queryFn: () => api.getBrandingLogo({ clientId: brandingClientId || undefined }),
    staleTime: 60 * 1000,
  });

  const publicBrandingQuery = useQuery<BrandingLogoResponse>({
    queryKey: ["/api/public/branding/logo"],
    enabled: preferAnyStoredLogo && !brandingClientId,
    queryFn: () => api.getPublicBrandingLogo(),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!brandingClientId) {
      const publicLogoUrl = preferAnyStoredLogo ? publicBrandingQuery.data?.logoUrl ?? null : null;
      setLogoSrc(publicLogoUrl || (preferAnyStoredLogo ? getAnyStoredBrandLogo() : null) || null);
      return;
    }
    if (!brandingQuery.isSuccess) return;

    const persistedLogoUrl = brandingQuery.data?.logoUrl ?? null;
    setStoredBrandLogo(persistedLogoUrl, brandingClientId);
    setLogoSrc(persistedLogoUrl || null);
  }, [
    brandingClientId,
    brandingQuery.data?.logoUrl,
    brandingQuery.isSuccess,
    preferAnyStoredLogo,
    publicBrandingQuery.data?.logoUrl,
  ]);

  useEffect(() => {
    const syncLogo = () => {
      setLogoSrc(
        (preferAnyStoredLogo && !brandingClientId ? publicBrandingQuery.data?.logoUrl ?? null : null)
        || 
        getStoredBrandLogo(brandingClientId)
        || (preferAnyStoredLogo ? getAnyStoredBrandLogo() : null)
        || null
      );
    };

    syncLogo();
    window.addEventListener(BRAND_LOGO_UPDATED_EVENT, syncLogo as EventListener);
    window.addEventListener("storage", syncLogo);
    return () => {
      window.removeEventListener(BRAND_LOGO_UPDATED_EVENT, syncLogo as EventListener);
      window.removeEventListener("storage", syncLogo);
    };
  }, [brandingClientId, preferAnyStoredLogo, publicBrandingQuery.data?.logoUrl]);

  return {
    logoSrc,
    brandingClientId,
    requiresClientSelection:
      !brandingClientId && (state.selectedClientId === "all" || !state.selectedClientId) && clientIds.length !== 1,
  };
}
