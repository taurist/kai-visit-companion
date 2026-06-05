import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { HashConfig } from "./hash";
import type { VisitDocument } from "./types";

export type RemotePayload = {
  document: VisitDocument;
  updatedAt: string;
};

export type SyncClient = {
  pull(): Promise<RemotePayload | null>;
  save(document: VisitDocument): Promise<RemotePayload>;
};

type SyncConfig = {
  roomId: string;
  roomKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type LocalSyncConfig = {
  roomId: string;
  roomKey: string;
  localSyncUrl: string;
};

type VisitResponse = {
  document: VisitDocument;
  updated_at: string;
};

export class VisitSyncClient {
  private client: SupabaseClient;
  private roomId: string;
  private roomKey: string;

  constructor(config: SyncConfig) {
    this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.roomId = config.roomId;
    this.roomKey = config.roomKey;
  }

  async pull(): Promise<RemotePayload | null> {
    const { data, error } = await this.client.rpc("visit_get", {
      p_room_id: this.roomId,
      p_room_key: this.roomKey,
    });

    if (error) {
      throw error;
    }
    if (!data) {
      return null;
    }

    const response = data as VisitResponse;
    return {
      document: response.document,
      updatedAt: response.updated_at,
    };
  }

  async save(document: VisitDocument): Promise<RemotePayload> {
    const { data, error } = await this.client.rpc("visit_upsert", {
      p_room_id: this.roomId,
      p_room_key: this.roomKey,
      p_document: document,
    });

    if (error) {
      throw error;
    }

    const response = data as VisitResponse;
    return {
      document: response.document,
      updatedAt: response.updated_at,
    };
  }
}

export class LocalVisitSyncClient implements SyncClient {
  private baseUrl: string;
  private roomId: string;
  private roomKey: string;

  constructor(config: LocalSyncConfig) {
    this.baseUrl = config.localSyncUrl.replace(/\/+$/, "");
    this.roomId = config.roomId;
    this.roomKey = config.roomKey;
  }

  private get roomUrl() {
    return `${this.baseUrl}/rooms/${encodeURIComponent(this.roomId)}`;
  }

  async pull(): Promise<RemotePayload | null> {
    const response = await fetch(`${this.roomUrl}?key=${encodeURIComponent(this.roomKey)}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return readVisitResponse(response);
  }

  async save(document: VisitDocument): Promise<RemotePayload> {
    const response = await fetch(this.roomUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Room-Key": this.roomKey,
      },
      body: JSON.stringify({ document }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    return readVisitResponse(response);
  }
}

async function readVisitResponse(response: Response): Promise<RemotePayload> {
  const data = (await response.json()) as VisitResponse;
  return {
    document: data.document,
    updatedAt: data.updated_at,
  };
}

async function getErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Sync failed: ${response.status}`;
  } catch {
    return `Sync failed: ${response.status}`;
  }
}

export function canUseRemoteSync(config: HashConfig) {
  return Boolean(config.roomId && config.roomKey && config.supabaseUrl && config.supabaseAnonKey);
}

export function canUseLocalSync(config: HashConfig) {
  return Boolean(config.roomId && config.roomKey && config.localSyncUrl);
}

export function canUseSync(config: HashConfig) {
  return canUseLocalSync(config) || canUseRemoteSync(config);
}
