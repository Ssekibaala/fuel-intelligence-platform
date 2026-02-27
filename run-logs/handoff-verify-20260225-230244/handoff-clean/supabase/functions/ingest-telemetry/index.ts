import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// --- UTILITIES ---

/**
 * Normalizes an object by sorting its keys lexicographically.
 * This ensures that logically identical JSON produces the same payload hash.
 */
function canonicalize(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  return Object.keys(obj)
    .sort()
    .reduce((acc: any, key: string) => {
      acc[key] = canonicalize(obj[key]);
      return acc;
    }, {});
}

async function getPayloadHash(payload: any): Promise<string> {
  const normalized = JSON.stringify(canonicalize(payload));
  const msgBuffer = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toCleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function normalizeImei(value: unknown): string | null {
  const raw = toCleanString(value);
  if (!raw) return null;
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.length > 0 ? digitsOnly : null;
}

function extractImeiFromReportName(reportNameValue: unknown): string | null {
  const raw = toCleanString(reportNameValue);
  if (!raw) return null;

  const parts = raw.split("|").map((segment) => segment.trim()).filter(Boolean);
  for (const part of parts) {
    const match = part.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (!match) continue;
    const key = match[1].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (["imei", "imeinumber", "imeino"].includes(key)) {
      return normalizeImei(match[2]);
    }
  }

  // Compact positional format fallback: "<imei>|<client>|<asset>"
  return normalizeImei(parts[0]);
}

function extractImeiFromPayload(payload: any): string | null {
  const candidates = [
    payload?.imei,
    payload?.imei_number,
    payload?.imeiNumber,
    payload?.device?.imei,
    payload?.data?.[0]?.imei,
    payload?.data?.[0]?.imei_number,
    payload?.data?.[0]?.imeiNumber
  ];

  for (const candidate of candidates) {
    const normalized = normalizeImei(candidate);
    if (normalized) return normalized;
  }

  return null;
}

// --- MAIN HANDLER ---

serve(async (req: Request) => {
  const startTime = Date.now();

  try {
    // 1. Authenticate Request
    const secret = Deno.env.get("WEBHOOK_SECRET");
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("secret");
    const incomingSecret = req.headers.get("X-Webhook-Secret") || querySecret;
    const incomingTimestamp = req.headers.get("X-Timestamp");

    console.log(`Diagnostic: Secret from Env: ${secret ? "SET" : "MISSING"}`);
    console.log(`Diagnostic: Secret from Query: ${querySecret ? "SET" : "MISSING"}`);
    console.log(`Diagnostic: Incoming Secret: ${incomingSecret ? "SET" : "MISSING"}`);

    // Timestamp Replay Protection (Max 5 minutes skew)
    let requestTimestamp: Date | null = null;
    if (incomingTimestamp) {
      requestTimestamp = new Date(incomingTimestamp);
      const now = new Date();
      const skewSeconds = Math.abs((now.getTime() - requestTimestamp.getTime()) / 1000);
      if (skewSeconds > 300) {
        console.error(`Webhook rejected: Timestamp skew too large (${skewSeconds}s)`);
        return new Response(JSON.stringify({ error: "Timestamp skew too large" }), {
          status: 401,
          headers: { "content-type": "application/json" }
        });
      }
    }

    const isSecretValid = secret && incomingSecret === secret;
    console.log(`Diagnostic: Is Secret Valid: ${isSecretValid}`);

    if (secret && !isSecretValid) {
      console.error("Unauthorized webhook attempt: Secret mismatch or missing.");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" }
      });
    }

    // 2. Parse Raw Payload
    const payload = await req.json();
    const headers: Record<string, string> = {};
    req.headers.forEach((v: string, k: string) => (headers[k] = v));

    // 3. Metadata Extraction
    const source = payload.source || "unknown";
    const reportType = String(payload.report_type || "0");
    const reportName = typeof payload.report_name === "string" ? payload.report_name.trim() : null;
    const extractedSourceImei = extractImeiFromPayload(payload) || extractImeiFromReportName(reportName);
    const sourceImei = reportType === "137" ? null : extractedSourceImei;
    const requestId = headers["x-request-id"] || headers["request-id"];

    // 4. Generate Idempotency Hash
    const payloadHash = await getPayloadHash(payload);

    // 5. Initialize Supabase Client (Service Role for Bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 6. Stage the Inbound Request
    const { error } = await supabaseAdmin
      .from("raw_telemetry_inbound")
      .insert({
        source,
        report_type: reportType,
        report_name: reportName,
        source_imei: sourceImei,
        payload_json: payload,
        headers_json: headers,
        payload_hash: payloadHash,
        request_id: requestId,
        request_timestamp: requestTimestamp?.toISOString(),
        signature_valid: isSecretValid,
        auth_method: secret ? "secret_header" : "none",
        status: "pending"
      });

    if (error) {
      if (error.code === "23505") {
        console.warn(`Duplicate payload blocked: ${payloadHash}`);
        return new Response(JSON.stringify({ message: "Accepted (Duplicate)" }), {
          status: 202,
          headers: { "content-type": "application/json" }
        });
      }

      console.error("Database error during staging:", error);
      throw error;
    }

    console.log(`Successfully staged ${source}/${reportType} in ${Date.now() - startTime}ms`);
    return new Response(JSON.stringify({ message: "Accepted only after the staging insert succeeds" }), {
      status: 202,
      headers: { "content-type": "application/json" }
    });

  } catch (err: any) {
    console.error("System error in ingest-telemetry:", err.message);
    return new Response(JSON.stringify({ error: "Internal Server Error (Sender should retry for temporary failures)" }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
})
