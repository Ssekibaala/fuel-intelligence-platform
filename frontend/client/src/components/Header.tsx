interface HeaderProps {
  onRefresh: () => void;
  selectedVehicle?: string;
  onVehicleChange?: (vehicle: string) => void;
}

export function Header({ onRefresh: _onRefresh }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 hidden border-b border-border/20 bg-background/55 backdrop-blur-xl md:block">
      <div className="mx-auto max-w-[1400px] px-4 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Fleet Intelligence
        </div>
      </div>
    </header>
  );
}
