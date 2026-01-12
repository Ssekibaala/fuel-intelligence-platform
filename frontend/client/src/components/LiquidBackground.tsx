export function LiquidBackground() {
  return (
    <div 
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Animated liquid background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-card">
        {/* Floating orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-liquid-flow" />
        <div className="absolute top-3/4 right-1/4 w-80 h-80 bg-chart-2/10 rounded-full blur-3xl animate-liquid-flow" style={{ animationDelay: '5s' }} />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-chart-3/8 rounded-full blur-3xl animate-liquid-flow" style={{ animationDelay: '10s' }} />
        
        {/* Subtle grid overlay */}
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