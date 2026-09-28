import type { Session } from "@supabase/supabase-js";
import {
  DEVICE_ALGORITHM,
  deviceMessage,
  deviceName,
  signDeviceMessage,
} from "../../supabase/functions/_shared/device.ts";
import { sales } from "./supabase";

// This browser as a device of the management panel: an ECDSA key pair kept
// in IndexedDB with a private half that cannot be exported, and the id the
// database gave it. Proving the device = signing the current session.

export type DeviceStatus = "trusted" | "pending" | "revoked" | "unknown";

interface Stored {
  id: string | null;
  name: string;
  keys: CryptoKeyPair;
}

const DB = "melendos-admin";
const STORE = "device";

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => open.result.close();
    };
  });
}

const load = () => idb<Stored | undefined>("readonly", (s) => s.get("this"));
const save = (d: Stored) => idb("readwrite", (s) => s.put(d, "this"));

/** This browser's device, created (with a new key) the first time. */
async function thisDevice(fresh = false): Promise<Stored> {
  const existing = fresh ? undefined : await load();
  if (existing) return existing;
  const keys = (await crypto.subtle.generateKey(DEVICE_ALGORITHM, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const d: Stored = { id: null, name: deviceName(navigator.userAgent), keys };
  await save(d);
  return d;
}

async function register(d: Stored): Promise<Stored> {
  const jwk = await crypto.subtle.exportKey("jwk", d.keys.publicKey);
  const { data, error } = await sales().rpc("register_sales_device", {
    p_name: d.name,
    p_public_key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
  });
  if (error) throw new Error(error.message);
  const saved = { ...d, id: data as string };
  await save(saved);
  return saved;
}

/** The Supabase session id in the JWT: it survives token refreshes and aal2. */
export function sessionIdOf(session: Session): string {
  return JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    .session_id as string;
}

async function prove(d: Stored, session: Session): Promise<{ status: DeviceStatus; name?: string }> {
  const sessionId = sessionIdOf(session);
  const timestamp = Date.now();
  const signature = await signDeviceMessage(
    d.keys.privateKey,
    deviceMessage(sessionId, timestamp),
  );
  const { data, error } = await sales().functions.invoke("device-session", {
    body: { device_id: d.id, timestamp, signature },
  });
  if (error) throw new Error("No se pudo comprobar este equipo");
  return data as { status: DeviceStatus; name?: string };
}

/**
 * Registers this browser if needed and proves it for the current session.
 * A revoked or forgotten device starts again with a new key (pending).
 */
export async function checkDevice(
  session: Session,
): Promise<{ status: DeviceStatus; id: string; name: string }> {
  if (!("indexedDB" in globalThis) || !crypto?.subtle) {
    throw new Error("Este navegador no puede guardar la clave del equipo (¿modo privado?)");
  }
  let d = await thisDevice();
  if (!d.id) d = await register(d);
  let r = await prove(d, session);
  if (r.status === "unknown" || r.status === "revoked") {
    d = await register(await thisDevice(true));
    r = await prove(d, session);
  }
  return { status: r.status, id: d.id!, name: d.name };
}
