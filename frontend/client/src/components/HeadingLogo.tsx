import { useBrandingLogo } from "@/hooks/use-branding-logo";

interface HeadingLogoProps {
  className?: string;
}

export function HeadingLogo({ className = "" }: HeadingLogoProps) {
  const { logoSrc } = useBrandingLogo();

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
