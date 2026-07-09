import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import { db } from "./db";
import {
  deriveKey,
  encryptJSON,
  decryptJSON,
  makeKeyCheck,
  verifyKeyCheck,
  randomSaltB64,
  type Ciphertext,
} from "./crypto";
import type { Trip, FuelEntry } from "./types";

/**
 * Optional end-to-end encrypted cloud sync for MileTrack.
 *
 * - Dexie/IndexedDB is always the source of truth on the device.
 * - When the user opts in, this module bidirectionally syncs trips + fuel to
 *   Lovable Cloud, encrypting each row's JSON payload with a WebCrypto AES-GCM
 *   key derived from a passphrase. The server never sees plaintext.
 * - Sync is a simple last-write-wins pull-then-push using `updated_at`. Good
 *   enough for single-user multi-device; not designed for concurrent writers.
 * - Works offline: writes accumulate in Dexie and flush on the next `sync()`.
 */

// Cache the derived key in memory for the session. NEVER persist it.
let cachedKey: CryptoKey | null = null;
let cachedUserId: string | null = null;

export function currentKey(): CryptoKey | null {
  return cachedKey;
}

interface SyncState {
  userId: string | null;
  userEmail: string | null;
  unlocked: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  init: () => Promise<void>;
  signOut: () => Promise<void>;
  unlock: (passphrase: string) => Promise<{ ok: boolean; error?: string }>;
  lock: () => void;
  sync: () => Promise<void>;
  wipeCloud: () => Promise<void>;
}

export const useSync = create<SyncState>((set, get) => ({
  userId: null,
  userEmail: null,
  unlocked: false,
  syncing: false,
  lastSyncAt: null,
  lastError: null,

  init: async () => {
    const { data } = await supabase.auth.getUser();
    set({ userId: data.user?.id ?? null, userEmail: data.user?.email ?? null });
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        cachedKey = null;
        cachedUserId = null;
        set({ userId: null, userEmail: null, unlocked: false });
      } else if (session.user) {
        set({ userId: session.user.id, userEmail: session.user.email ?? null });
      }
    });
  },

  signOut: async () => {
    cachedKey = null;
    cachedUserId = null;
    await supabase.auth.signOut();
    set({ userId: null, userEmail: null, unlocked: false });
  },

  unlock: async (passphrase: string) => {
    const uid = get().userId;
    if (!uid) return { ok: false, error: "Not signed in" };
    if (passphrase.length < 8) return { ok: false, error: "Passphrase must be at least 8 characters" };

    // Fetch (or create) the per-user salt + key check row.
    const { data: existing, error: fetchErr } = await supabase
      .from("sync_key_salts")
      .select("salt, key_check_ciphertext, key_check_iv")
      .eq("user_id", uid)
      .maybeSingle();
    if (fetchErr) return { ok: false, error: fetchErr.message };

    if (!existing) {
      // First device: create salt + key-check.
      const salt = randomSaltB64();
      const key = await deriveKey(passphrase, salt);
      const check = await makeKeyCheck(key);
      const { error } = await supabase.from("sync_key_salts").insert({
        user_id: uid,
        salt,
        key_check_ciphertext: check.ciphertext,
        key_check_iv: check.iv,
      });
      if (error) return { ok: false, error: error.message };
      cachedKey = key;
      cachedUserId = uid;
      set({ unlocked: true, lastError: null });
      return { ok: true };
    }

    const key = await deriveKey(passphrase, existing.salt);
    const ok = await verifyKeyCheck(key, {
      ciphertext: existing.key_check_ciphertext,
      iv: existing.key_check_iv,
    });
    if (!ok) return { ok: false, error: "Incorrect passphrase" };
    cachedKey = key;
    cachedUserId = uid;
    set({ unlocked: true, lastError: null });
    return { ok: true };
  },

  lock: () => {
    cachedKey = null;
    set({ unlocked: false });
  },

  sync: async () => {
    const uid = get().userId;
    const key = cachedKey;
    if (!uid || !key) return;
    if (get().syncing) return;
    set({ syncing: true, lastError: null });
    try {
      await syncTable("synced_trips", uid, key, "trips");
      await syncTable("synced_fuel", uid, key, "fuel");
      set({ lastSyncAt: Date.now() });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      set({ syncing: false });
    }
  },

  wipeCloud: async () => {
    const uid = get().userId;
    if (!uid) return;
    await supabase.from("synced_trips").delete().eq("user_id", uid);
    await supabase.from("synced_fuel").delete().eq("user_id", uid);
    await supabase.from("sync_key_salts").delete().eq("user_id", uid);
    cachedKey = null;
    set({ unlocked: false });
  },
}));

type RemoteRow = { id: string; payload_ciphertext: string; iv: string; updated_at: string; deleted: boolean };

async function syncTable(
  table: "synced_trips" | "synced_fuel",
  userId: string,
  key: CryptoKey,
  localTable: "trips" | "fuel",
) {
  // PULL: get all remote rows for the user (RLS enforced). For small
  // personal datasets this is fine; can be watermarked later.
  const { data: remote, error } = await supabase
    .from(table)
    .select("id, payload_ciphertext, iv, updated_at, deleted")
    .eq("user_id", userId);
  if (error) throw error;

  const remoteById = new Map<string, RemoteRow>();
  for (const r of remote ?? []) remoteById.set(r.id, r as RemoteRow);

  // Merge remote → local.
  const localRows =
    localTable === "trips"
      ? await db().trips.toArray()
      : await db().fuel.toArray();
  const localById = new Map<string, Trip | FuelEntry>();
  for (const l of localRows) localById.set(l.id, l);

  for (const r of remoteById.values()) {
    const local = localById.get(r.id);
    const remoteTime = new Date(r.updated_at).getTime();
    if (r.deleted) {
      if (local) {
        if (localTable === "trips") await db().trips.delete(r.id);
        else await db().fuel.delete(r.id);
      }
      continue;
    }
    if (!local || local.updatedAt < remoteTime) {
      try {
        const payload = await decryptJSON(key, { ciphertext: r.payload_ciphertext, iv: r.iv });
        if (localTable === "trips") await db().trips.put(payload as Trip);
        else await db().fuel.put(payload as FuelEntry);
      } catch {
        // Silently skip rows we can't decrypt (e.g. old key).
      }
    }
  }

  // PUSH: upsert any local row newer than remote (or missing remote).
  const toPush: Array<Trip | FuelEntry> = [];
  for (const l of localRows) {
    const r = remoteById.get(l.id);
    if (!r || new Date(r.updated_at).getTime() < l.updatedAt) toPush.push(l);
  }
  for (const l of toPush) {
    const ct: Ciphertext = await encryptJSON(key, l);
    await supabase.from(table).upsert({
      id: l.id,
      user_id: userId,
      payload_ciphertext: ct.ciphertext,
      iv: ct.iv,
      updated_at: new Date(l.updatedAt).toISOString(),
      deleted: false,
    });
  }
}

/** Fire-and-forget sync when the browser reports we're back online. */
export function attachOnlineSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    const s = useSync.getState();
    if (s.unlocked) void s.sync();
  });
}
