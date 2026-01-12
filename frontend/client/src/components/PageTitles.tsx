import { ReactNode } from "react";

interface PageTitleConfig {
  title: string;
  subtitle: string;
  icon?: ReactNode;
}

interface PageTitlesMap {
  [key: string]: PageTitleConfig;
}

export const pageTitles: PageTitlesMap = {
  dashboard: {
    title: "Fleet Sentinel Dashboard",
    subtitle: "Fleet Totals - Professional Data Density"
  },
  assets: {
    title: "Vehicle Management Hub",
    subtitle: "Monitor and optimize your fleet in real-time"
  },
  vehicles: {
    title: "Vehicle Management Hub",
    subtitle: "Monitor and optimize your fleet in real-time"
  },
  alerts: {
    title: "Alerts Monitoring",
    subtitle: "Proactive notifications for fleet safety and efficiency"
  },
  reports: {
    title: "Reports Center",
    subtitle: "Generate professional, branded reports for stakeholders and compliance"
  },
  settings: {
    title: "System Configuration",
    subtitle: "Customize and manage your Fleet Sentinel preferences"
  }
};

export const getPageTitle = (pageId: string): PageTitleConfig => {
  return pageTitles[pageId] || {
    title: "Fleet Sentinel",
    subtitle: "Advanced Fleet Monitoring"
  };
};