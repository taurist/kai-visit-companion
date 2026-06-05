import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const host = process.env.LOCAL_SYNC_HOST ?? "0.0.0.0";
const port = Number(process.env.LOCAL_SYNC_PORT ?? 8787);
const dataFile = path.resolve(process.env.LOCAL_SYNC_FILE ?? "data/local-sync.json");
const seedFile = path.resolve(process.env.LOCAL_SYNC_SEED ?? "public/kai.local.json");
const maxBodyBytes = 1_000_000;

const emptyDatabase = () => ({ rooms: {} });

let database = await loadDatabase();
let seedDocument = await loadSeedDocument();

function now() {
  return new Date().toISOString();
}

function hashKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function loadDatabase() {
  if (!existsSync(dataFile)) return emptyDatabase();
  try {
    return JSON.parse(await readFile(dataFile, "utf8"));
  } catch {
    return emptyDatabase();
  }
}

async function loadSeedDocument() {
  if (!existsSync(seedFile)) return null;
  try {
    return JSON.parse(await readFile(seedFile, "utf8"));
  } catch {
    return null;
  }
}

async function saveDatabase() {
  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(database, null, 2)}\n`);
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Room-Key",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(value));
}

function sendOptions(response) {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Room-Key",
    "Access-Control-Max-Age": "86400",
  });
  response.end();
}

async function readBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > maxBodyBytes) {
      throw new Error("Request is too large");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getRoomId(url) {
  const match = url.pathname.match(/^\/rooms\/([^/]+)$/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function getRoomKey(request, url, body = {}) {
  return (
    request.headers["x-room-key"]?.toString() ||
    url.searchParams.get("key") ||
    body.roomKey ||
    body.key ||
    ""
  ).trim();
}

function validateRoomId(roomId) {
  return /^[a-zA-Z0-9._-]{3,80}$/.test(roomId);
}

async function getOrCreateRoom(roomId, roomKey) {
  if (!roomKey) {
    return { error: { status: 401, message: "Missing room key" } };
  }

  const keyHash = hashKey(roomKey);
  const existing = database.rooms[roomId];
  if (existing) {
    if (existing.keyHash !== keyHash) {
      return { error: { status: 403, message: "Wrong room key" } };
    }
    return { room: existing };
  }

  const room = {
    keyHash,
    document: seedDocument ?? {
      version: 1,
      profile: {
        childLabel: "Visit",
        visitLabel: "Appointment",
        dateLabel: "Upcoming visit",
        summary: "Decision record and question tracker",
      },
      summary: { today: [], deferred: [], schedule: [], beforeLeaving: [] },
      decisions: [],
      tasks: [],
      questions: [],
      scripts: [],
      notes: "",
      outcomes: {
        pcvProduct: "",
        rotavirusProduct: "",
        nextVaccineDate: "",
        growthTarget: "",
        referrals: "",
      },
    },
    updatedAt: now(),
  };
  database.rooms[roomId] = room;
  await saveDatabase();
  return { room };
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendOptions(response);
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        rooms: Object.keys(database.rooms).length,
        seedLoaded: Boolean(seedDocument),
      });
      return;
    }

    const roomId = getRoomId(url);
    if (!roomId || !validateRoomId(roomId)) {
      sendJson(response, 404, { error: "Unknown route" });
      return;
    }

    if (request.method === "GET") {
      const roomKey = getRoomKey(request, url);
      const result = await getOrCreateRoom(roomId, roomKey);
      if (result.error) {
        sendJson(response, result.error.status, { error: result.error.message });
        return;
      }

      sendJson(response, 200, {
        document: result.room.document,
        updated_at: result.room.updatedAt,
      });
      return;
    }

    if (request.method === "PUT") {
      const body = await readBody(request);
      const roomKey = getRoomKey(request, url, body);
      const result = await getOrCreateRoom(roomId, roomKey);
      if (result.error) {
        sendJson(response, result.error.status, { error: result.error.message });
        return;
      }
      if (!body.document || typeof body.document !== "object") {
        sendJson(response, 400, { error: "Missing document" });
        return;
      }

      result.room.document = body.document;
      result.room.updatedAt = now();
      await saveDatabase();

      sendJson(response, 200, {
        document: result.room.document,
        updated_at: result.room.updatedAt,
      });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Local sync failed" });
  }
});

server.listen(port, host, () => {
  console.log(`Local sync server running on http://${host}:${port}`);
  console.log(`Data file: ${dataFile}`);
  console.log(`Seed file: ${seedFile}${seedDocument ? "" : " (not loaded)"}`);
});
