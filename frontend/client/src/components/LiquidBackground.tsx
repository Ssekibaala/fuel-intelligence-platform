export function LiquidBackground() {
  return (
    <div 
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-card">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.06),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.05),transparent_28%)]" />
        <div className="absolute inset-0 opacity-[0.02]">
          <div className="h-full w-full" style={{ 
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }} />
        </div>
      </div>
    </div>
  );
}
