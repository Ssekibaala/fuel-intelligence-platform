export const BRAND_LOGO_STORAGE_KEY = "teletrac_fuel_heading_logo_data_url";
export const BRAND_LOGO_UPDATED_EVENT = "teletrac-fuel-logo-updated";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getStoredBrandLogo(): string | null {
  if (!isBrowser()) return null;
  try {
    const value = window.localStorage.getItem(BRAND_LOGO_STORAGE_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setStoredBrandLogo(dataUrl: string | null) {
  if (!isBrowser()) return;

  try {
    if (dataUrl && dataUrl.trim().length > 0) {
      window.localStorage.setItem(BRAND_LOGO_STORAGE_KEY, dataUrl);
    } else {
      window.localStorage.removeItem(BRAND_LOGO_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(BRAND_LOGO_UPDATED_EVENT));
  } catch {
    // Keep UI functional if localStorage is unavailable.
  }
}
