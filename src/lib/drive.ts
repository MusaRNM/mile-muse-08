/**
 * Per-user Google Drive backup. Uses Google Identity Services (GIS) directly
 * in the browser — no MileTrack-hosted backend. The `drive.file` scope only
 * grants access to files this app creates, so we can never see anything else
 * in the user's Drive.
 *
 * Flow:
 *   1. Load the GIS client script (once).
 *   2. Request an access token with the drive.file scope.
 *   3. Upload/download a single `miletrack-backup.json` inside the user's Drive.
 */

const GIS_SCRIPT_ID = "google-identity-services";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const BACKUP_FILENAME = "miletrack-backup.json";

const STATE_KEY = "miletrack-drive-state-v1";

interface DriveState {
  email: string | null;
  fileId: string | null;
  lastBackupAt: number | null;
}

interface GoogleTokenClient {
  callback: (resp: GoogleTokenResponse) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
}
interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
}
interface GoogleAccountsOAuth2 {
  initTokenClient: (opts: {
    client_id: string;
    scope: string;
    prompt?: string;
    callback: (resp: GoogleTokenResponse) => void;
  }) => GoogleTokenClient;
  revoke: (token: string, done?: () => void) => void;
}
type WindowWithGis = Window & {
  google?: { accounts?: { oauth2?: GoogleAccountsOAuth2 } };
};
function gis(): GoogleAccountsOAuth2 | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as WindowWithGis).google?.accounts?.oauth2;
}

let tokenClient: GoogleTokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;

export function getClientId(): string {
  return (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined) ?? "";
}

export function isConfigured(): boolean {
  return getClientId().trim().length > 0;
}

function loadState(): DriveState {
  if (typeof window === "undefined") return { email: null, fileId: null, lastBackupAt: null };
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return { email: null, fileId: null, lastBackupAt: null };
    return JSON.parse(raw) as DriveState;
  } catch {
    return { email: null, fileId: null, lastBackupAt: null };
  }
}
function saveState(state: DriveState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function getDriveState(): DriveState {
  return loadState();
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("SSR"));
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services")));
      return;
    }
    const script = document.createElement("script");
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

async function getTokenClient(): Promise<GoogleTokenClient> {
  if (tokenClient) return tokenClient;
  await loadGisScript();
  const clientId = getClientId();
  if (!clientId) throw new Error("Google Drive client ID is not configured.");
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services unavailable.");
  tokenClient = oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: () => {
      /* replaced per-request */
    },
  });
  return tokenClient;
}

async function requestAccessToken(interactive: boolean): Promise<string> {
  const client = await getTokenClient();
  return new Promise<string>((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      if (!resp.access_token) {
        reject(new Error("No access token returned"));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000 - 60_000;
      resolve(resp.access_token);
    };
    client.requestAccessToken({ prompt: interactive ? "consent" : "" });
  });
}

async function ensureToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  return requestAccessToken(false);
}

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await ensureToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`https://www.googleapis.com${path}`, { ...init, headers });
  if (res.status === 401) {
    // Token might have been revoked; force reauth once.
    accessToken = null;
    const fresh = await requestAccessToken(true);
    headers.set("Authorization", `Bearer ${fresh}`);
    return fetch(`https://www.googleapis.com${path}`, { ...init, headers });
  }
  return res;
}

async function fetchUserEmail(): Promise<string | null> {
  try {
    const token = await ensureToken();
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

/** Start the Google consent flow. Returns the connected email on success. */
export async function connectDrive(): Promise<string | null> {
  await requestAccessToken(true);
  const email = await fetchUserEmail();
  const state = loadState();
  saveState({ ...state, email });
  return email;
}

/** Revoke the current access token and forget local state. */
export async function disconnectDrive(): Promise<void> {
  try {
    if (accessToken) {
      await new Promise<void>((resolve) => {
        window.google?.accounts?.oauth2?.revoke(accessToken!, () => resolve());
      });
    }
  } catch {
    /* ignore */
  }
  accessToken = null;
  tokenExpiresAt = 0;
  saveState({ email: null, fileId: null, lastBackupAt: null });
}

async function findBackupFileId(): Promise<string | null> {
  const state = loadState();
  if (state.fileId) return state.fileId;
  const q = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
  const res = await driveFetch(`/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`);
  if (!res.ok) throw new Error(`Drive lookup failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { files?: { id: string; name: string }[] };
  const fileId = data.files?.[0]?.id ?? null;
  if (fileId) saveState({ ...state, fileId });
  return fileId;
}

/** Upload the given JSON content as `miletrack-backup.json` in the user's Drive. */
export async function uploadBackup(content: string): Promise<void> {
  const existing = await findBackupFileId();
  const metadata = { name: BACKUP_FILENAME, mimeType: "application/json" };
  const boundary = "-------miletrack-" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(existing ? { mimeType: metadata.mimeType } : metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    content +
    `\r\n--${boundary}--`;

  const path = existing
    ? `/upload/drive/v3/files/${encodeURIComponent(existing)}?uploadType=multipart`
    : `/upload/drive/v3/files?uploadType=multipart`;

  const res = await driveFetch(path, {
    method: existing ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Backup upload failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id?: string };
  const state = loadState();
  saveState({ ...state, fileId: data.id ?? existing, lastBackupAt: Date.now() });
}

/** Fetch the JSON contents of the backup file. Returns null if none exists. */
export async function downloadBackup(): Promise<string | null> {
  const fileId = await findBackupFileId();
  if (!fileId) return null;
  const res = await driveFetch(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Backup download failed: ${res.status} ${await res.text()}`);
  return res.text();
}
