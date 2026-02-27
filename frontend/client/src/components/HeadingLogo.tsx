import { useEffect, useState } from "react";
import teletracLogo from "@/assets/teletrac-logo.png";
import { BRAND_LOGO_UPDATED_EVENT, getStoredBrandLogo } from "@/lib/branding";

interface HeadingLogoProps {
  className?: string;
}

export function HeadingLogo({ className = "" }: HeadingLogoProps) {
  const [logoSrc, setLogoSrc] = useState<string>(() => getStoredBrandLogo() || teletracLogo);

  useEffect(() => {
    const syncLogo = () => {
      setLogoSrc(getStoredBrandLogo() || teletracLogo);
    };

    syncLogo();
    window.addEventListener(BRAND_LOGO_UPDATED_EVENT, syncLogo as EventListener);
    window.addEventListener("storage", syncLogo);

    return () => {
      window.removeEventListener(BRAND_LOGO_UPDATED_EVENT, syncLogo as EventListener);
      window.removeEventListener("storage", syncLogo);
    };
  }, []);

  return (
    <div className={`inline-flex items-center rounded-lg border border-border/40 bg-white px-3 py-2 shadow-sm ${className}`}>
      <img
        src={logoSrc}
        alt="Teletrac Fuel logo"
        className="h-10 w-auto max-w-[220px] object-contain"
      />
    </div>
  );
}
