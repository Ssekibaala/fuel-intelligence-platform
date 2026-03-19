import { getPageTitle } from "./PageTitles";
import { HeadingLogo } from "./HeadingLogo";

interface PageHeaderProps {
  pageId: string;
  className?: string;
}

export function PageHeader({ pageId, className = "" }: PageHeaderProps) {
  const { title, subtitle } = getPageTitle(pageId);

  return (
    <div className={`mb-5 sm:mb-6 ${className}`}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-3">
        <HeadingLogo className="shrink-0" />
        <div className="min-w-0 max-w-4xl">
          <h1 className="mb-1 text-xl font-bold leading-tight text-foreground sm:text-2xl">{title}</h1>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
