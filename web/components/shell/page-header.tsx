import { Breadcrumbs } from "./breadcrumbs";

export function PageHeader({
  title,
  description,
  actions,
  crumb,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumb?: string;
}) {
  return (
    <div className="ap-rise flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <Breadcrumbs current={crumb} className="mb-1.5" />
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <div className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
