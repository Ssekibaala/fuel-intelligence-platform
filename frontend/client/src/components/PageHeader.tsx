import { getPageTitle } from "./PageTitles";
import { HeadingLogo } from "./HeadingLogo";

interface PageHeaderProps {
  pageId: string;
  className?: string;
}

export function PageHeader({ pageId, className = "" }: PageHeaderProps) {
  const { title, subtitle } = getPageTitle(pageId);

  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <HeadingLogo className="shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
