import { normalizeDocument } from "./document";
import type { VisitDocument } from "./types";

export type HashConfig = {
  roomId: string | null;
  roomKey: string | null;
  seed: VisitDocument | null;
  seedUrl: string | null;
  reset: boolean;
  localSyncUrl: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function base64UrlEncode(value: string): string {
  const bytes = textEncoder.encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return textDecoder.decode(bytes);
}

export function encodeSeed(document: VisitDocument): string {
  return base64UrlEncode(JSON.stringify(document));
}

export function decodeSeed(value: string | null): VisitDocument | null {
  if (!value) return null;
  try {
    return normalizeDocument(JSON.parse(base64UrlDecode(value)));
  } catch {
    return null;
  }
}

export function readHashConfig(): HashConfig {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const seed = decodeSeed(params.get("seed"));
  const roomId = params.get("room") || null;
  const roomKey = params.get("key") || null;
  const localSyncUrl =
    params.get("localSyncUrl") ||
    (params.get("localSync") === "1" ? `${window.location.protocol}//${window.location.hostname}:8787` : null);
  const supabaseUrl = params.get("supabaseUrl") || localStorage.getItem("visit-companion:supabase-url");
  const supabaseAnonKey =
    params.get("supabaseAnonKey") || localStorage.getItem("visit-companion:supabase-anon-key");

  if (supabaseUrl) {
    localStorage.setItem("visit-companion:supabase-url", supabaseUrl);
  }
  if (supabaseAnonKey) {
    localStorage.setItem("visit-companion:supabase-anon-key", supabaseAnonKey);
  }

  return {
    roomId,
    roomKey,
    seed,
    seedUrl: params.get("seedUrl") || null,
    reset: params.get("reset") === "1",
    localSyncUrl,
    supabaseUrl,
    supabaseAnonKey,
  };
}
