import { ThemeProvider } from '../ThemeProvider';

export default function ThemeProviderExample() {
  return (
    <ThemeProvider>
      <div className="p-4">
        <div className="text-foreground">Theme Provider is working</div>
        <div className="text-muted-foreground">Secondary text</div>
      </div>
    </ThemeProvider>
  );
}