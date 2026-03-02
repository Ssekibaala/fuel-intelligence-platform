export const BRAND_LOGO_STORAGE_KEY = "teletrac_fuel_heading_logo_data_url";
export const BRAND_LOGO_UPDATED_EVENT = "teletrac-fuel-logo-updated";

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeBrandingClientId(clientId?: string | null): string | null {
  if (!clientId) return null;
  const normalized = String(clientId).trim();
  if (!normalized || normalized.toLowerCase() === "all") return null;
  return normalized;
}

function storageKeyForClient(clientId: string) {
  return `${BRAND_LOGO_STORAGE_KEY}:${clientId}`;
}

export function resolveBrandingClientId(selectedClientId?: string | null, assignedClientIds: string[] = []): string | null {
  const selected = normalizeBrandingClientId(selectedClientId);
  if (selected) return selected;
  if (assignedClientIds.length === 1) {
    return normalizeBrandingClientId(assignedClientIds[0]);
  }
  return null;
}

export function getStoredBrandLogo(clientId?: string | null): string | null {
  if (!isBrowser()) return null;
  const normalizedClientId = normalizeBrandingClientId(clientId);
  if (!normalizedClientId) return null;
  try {
    const value = window.localStorage.getItem(storageKeyForClient(normalizedClientId));
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setStoredBrandLogo(dataUrl: string | null, clientId?: string | null) {
  if (!isBrowser()) return;
  const normalizedClientId = normalizeBrandingClientId(clientId);
  if (!normalizedClientId) return;

  try {
    const key = storageKeyForClient(normalizedClientId);
    if (dataUrl && dataUrl.trim().length > 0) {
      window.localStorage.setItem(key, dataUrl);
    } else {
      window.localStorage.removeItem(key);
    }
    window.dispatchEvent(
      new CustomEvent(BRAND_LOGO_UPDATED_EVENT, {
        detail: { clientId: normalizedClientId },
      })
    );
  } catch {
    // Keep UI functional if localStorage is unavailable.
  }
}
