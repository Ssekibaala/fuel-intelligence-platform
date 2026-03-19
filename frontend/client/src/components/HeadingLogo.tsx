import { useBrandingLogo } from "@/hooks/use-branding-logo";

interface HeadingLogoProps {
  className?: string;
}

export function HeadingLogo({ className = "" }: HeadingLogoProps) {
  const { logoSrc } = useBrandingLogo();

  return (
    <div className={`inline-flex items-center rounded-lg border border-border/40 bg-white px-2 py-1.5 shadow-sm sm:px-3 sm:py-2 ${className}`}>
      <img
        src={logoSrc}
        alt="Teletrac Fuel logo"
        className="h-8 w-auto max-w-[160px] object-contain sm:h-10 sm:max-w-[220px]"
      />
    </div>
  );
}
