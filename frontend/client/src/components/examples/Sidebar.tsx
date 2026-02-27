import { useState } from "react";
import { Sidebar } from '../Sidebar';

export default function SidebarExample() {
  const [activePage, setActivePage] = useState("dashboard");
  const [theme, setTheme] = useState("dark");
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className="h-96 w-80 bg-background rounded-xl overflow-hidden border">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    </div>
  );
}
