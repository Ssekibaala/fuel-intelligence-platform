import { useState } from "react";
import { Sidebar } from '../Sidebar';

export default function SidebarExample() {
  const [activePage, setActivePage] = useState("dashboard");

  return (
    <div className="h-96 w-80 bg-background rounded-xl overflow-hidden border">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
      />
    </div>
  );
}
