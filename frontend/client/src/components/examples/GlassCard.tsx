import { GlassCard } from '../GlassCard';

export default function GlassCardExample() {
  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-2">Glass Card</h3>
        <p className="text-muted-foreground">Premium glassmorphism design</p>
      </GlassCard>
      <GlassCard className="p-6" hover={false}>
        <h3 className="text-lg font-semibold text-foreground mb-2">No Hover</h3>
        <p className="text-muted-foreground">Static glass card</p>
      </GlassCard>
    </div>
  );
}