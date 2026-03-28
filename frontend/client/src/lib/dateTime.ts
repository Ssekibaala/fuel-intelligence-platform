const EAT_TIMEZONE = "Africa/Nairobi";

export const DB_TIMEZONE_LABELS = {
  webhookLocal: "EAT+3",
  report0Utc: "GMT+0",
} as const;

const buildFormatter = (timeZone: string, withSeconds = true) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false,
  });

const EAT_FORMATTER = buildFormatter(EAT_TIMEZONE);
const UTC_FORMATTER = buildFormatter("UTC");
const EAT_SHORT_FORMATTER = buildFormatter(EAT_TIMEZONE, false);

const toDate = (value: unknown): Date | null => {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateTimeEAT = (value: unknown, fallback = "Unknown"): string => {
  const parsed = toDate(value);
  return parsed ? `${EAT_FORMATTER.format(parsed)} EAT` : fallback;
};

export const formatDateTimeUTC = (value: unknown, fallback = "Unknown"): string => {
  const parsed = toDate(value);
  return parsed ? `${UTC_FORMATTER.format(parsed)} UTC` : fallback;
};

export const formatDateTimeDual = (value: unknown, fallback = "Unknown"): string => {
  const parsed = toDate(value);
  if (!parsed) return fallback;
  return `${EAT_FORMATTER.format(parsed)} EAT | ${UTC_FORMATTER.format(parsed)} UTC`;
};

export const formatChartAxisEAT = (value: unknown, dense = false): string => {
  const parsed = toDate(value);
  if (!parsed) return String(value ?? "");

  if (dense) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: EAT_TIMEZONE,
      month: "short",
      day: "2-digit",
    }).format(parsed);
  }

  return `${EAT_SHORT_FORMATTER.format(parsed)} EAT`;
};
