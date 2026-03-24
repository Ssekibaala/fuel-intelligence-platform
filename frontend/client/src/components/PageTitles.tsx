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
    title: "Teletrac Fuel",
    subtitle: "Fleet Totals - Professional Data Density"
  },
  assets: {
    title: "Fleet Assets",
    subtitle: "High-density overview of all fleet vehicles with key performance metrics"
  },
  journeys: {
    title: "Journey Intelligence",
    subtitle: "Find real A → B → A route behaviour, compare repeated visits, and save premium route analyses"
  },
  vehicles: {
    title: "Fleet Assets",
    subtitle: "High-density overview of all fleet vehicles with key performance metrics"
  },
  alerts: {
    title: "Alerts Monitoring",
    subtitle: "Proactive notifications for fleet safety and efficiency"
  },
  reports: {
    title: "Reports Center",
    subtitle: "Generate professional, branded reports for stakeholders and compliance"
  },
  admin: {
    title: "Administration",
    subtitle: "Manage users, roles, and client access assignments"
  },
  settings: {
    title: "System Configuration",
    subtitle: "Customize and manage your Teletrac Fuel preferences"
  }
};

export const getPageTitle = (pageId: string): PageTitleConfig => {
  return pageTitles[pageId] || {
    title: "Teletrac Fuel",
    subtitle: "Advanced Fleet Monitoring"
  };
};

