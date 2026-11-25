import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { isAdminEmail } from "./adminConfig";

function cleanEnvValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim() || undefined;
}

function rebuildPemFromBody(header: string, footer: string, rawBody: string): string {
  const base64Only = rawBody
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  const lines = base64Only.match(/.{1,64}/g) || [];
  return `${header}\n${lines.join("\n")}\n${footer}\n`;
}

function normalizePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw.trim();

  if (cleaned.startsWith("{")) {
    try {
      const parsed = JSON.parse(cleaned) as { private_key?: string };
      if (parsed.private_key) cleaned = parsed.private_key;
    } catch {
      // fall through
    }
  }

  cleaned = cleaned.replace(/^"?private_key"?\s*:\s*/i, "").replace(/,\s*$/, "").trim();
  cleaned = cleaned.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();

  if (!cleaned.includes("BEGIN") && /^[A-Za-z0-9+/=\s]+$/.test(cleaned) && cleaned.length > 200) {
    try {
      const decoded = Buffer.from(cleaned.replace(/\s+/g, ""), "base64").toString("utf-8");
      if (decoded.includes("BEGIN")) {
        cleaned = decoded;
      }
    } catch {
      // fall through
    }
  }

  cleaned = cleaned.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "");

  const pkcs8Match = cleaned.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (pkcs8Match) {
    return rebuildPemFromBody(
      "-----BEGIN PRIVATE KEY-----",
      "-----END PRIVATE KEY-----",
      pkcs8Match[1]
    );
  }

  const rsaMatch = cleaned.match(/-----BEGIN RSA PRIVATE KEY-----([\s\S]*?)-----END RSA PRIVATE KEY-----/);
  if (rsaMatch) {
    return rebuildPemFromBody(
      "-----BEGIN RSA PRIVATE KEY-----",
      "-----END RSA PRIVATE KEY-----",
      rsaMatch[1]
    );
  }

  return cleaned;
}

function resolveServiceAccount() {
  let projectId = cleanEnvValue(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
  );
  let clientEmail = cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL);
  let rawKey = process.env.FIREBASE_PRIVATE_KEY;

  // Support pasting the full Service Account JSON into FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PRIVATE_KEY
  for (const candidate of [process.env.FIREBASE_SERVICE_ACCOUNT_JSON, process.env.FIREBASE_PRIVATE_KEY]) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed.startsWith("{")) {
      try {
        const sa = JSON.parse(trimmed) as {
          project_id?: string;
          client_email?: string;
          private_key?: string;
        };
        projectId = projectId || cleanEnvValue(sa.project_id);
        clientEmail = clientEmail || cleanEnvValue(sa.client_email);
        if (sa.private_key) rawKey = sa.private_key;
      } catch {
        // ignore invalid JSON
      }
    }
  }

  const privateKey = normalizePrivateKey(rawKey);
  return { projectId, clientEmail, privateKey };
}

function ensureAdminApp(): App {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const { projectId, clientEmail, privateKey } = resolveServiceAccount();

  const missing: string[] = [];
  if (!projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase Admin env var(s) on server: ${missing.join(", ")}. Make sure Production & Preview are checked in Vercel and redeploy.`
    );
  }

  if (!privateKey!.includes("-----BEGIN") || privateKey!.length < 400) {
    throw new Error(
      `FIREBASE_PRIVATE_KEY is invalid (length=${privateKey!.length}). Copy the full "private_key" value (not "private_key_id") from your Firebase Service Account JSON.`
    );
  }

  return initializeApp({
    credential: cert({
      projectId: projectId!,
      clientEmail: clientEmail!,
      privateKey: privateKey!,
    }),
  });
}

export function getAdminEnvDiagnostics() {
  const { projectId, clientEmail, privateKey } = resolveServiceAccount();
  let adminInitOk = false;
  let adminInitError: string | null = null;

  try {
    ensureAdminApp();
    adminInitOk = true;
  } catch (err) {
    adminInitError = err instanceof Error ? err.message : String(err);
  }

  return {
    version: "3.1.0",
    vercelEnv: process.env.VERCEL_ENV || "unknown",
    hasProjectId: Boolean(projectId),
    projectIdPreview: projectId || null,
    hasClientEmail: Boolean(clientEmail),
    clientEmailDomain: clientEmail?.split("@")[1] || null,
    hasPrivateKey: Boolean(privateKey),
    privateKeyLength: privateKey?.length || 0,
    hasPemHeader: Boolean(privateKey?.includes("-----BEGIN")),
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    adminInitOk,
    adminInitError,
  };
}

export function getAdminAuth() {
  return getAuth(ensureAdminApp());
}

export function getAdminDb() {
  return getFirestore(ensureAdminApp());
}

export interface AdminAuthResult {
  user: DecodedIdToken | null;
  error?: string;
  status: number;
}

export async function authenticateAdminRequest(req: Request): Promise<AdminAuthResult> {
  const token = req.headers.get("authorization")?.split("Bearer ")[1];
  if (!token) {
    return { user: null, error: "Missing sign-in token. Please sign out and sign in again.", status: 401 };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!isAdminEmail(decoded.email)) {
      return {
        user: null,
        error: `Admin access required (${decoded.email || "unknown account"} is not an authorised admin).`,
        status: 403,
      };
    }
    if (!decoded.email_verified) {
      return {
        user: null,
        error: `Admin account (${decoded.email}) is not marked email_verified by Firebase Auth.`,
        status: 403,
      };
    }
    return { user: decoded, status: 200 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown Firebase Admin error";
    console.error("authenticateAdminRequest failed:", err);
    return {
      user: null,
      error: `Firebase Admin check failed: ${msg}`,
      status: 500,
    };
  }
}

export async function verifyAdminRequest(req: Request): Promise<DecodedIdToken | null> {
  const result = await authenticateAdminRequest(req);
  return result.user;
}
