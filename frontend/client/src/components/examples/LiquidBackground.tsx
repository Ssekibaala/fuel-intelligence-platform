import { LiquidBackground } from '../LiquidBackground';

export default function LiquidBackgroundExample() {
  return (
    <div className="relative h-64 w-full overflow-hidden rounded-xl">
      <LiquidBackground />
      <div className="relative z-10 flex items-center justify-center h-full">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground">Liquid Background</h3>
          <p className="text-muted-foreground">Animated gradient background</p>
        </div>
      </div>
    </div>
  );
}