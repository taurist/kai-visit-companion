import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const [, , baseUrl, seedFile] = process.argv;

if (!baseUrl || !seedFile) {
  console.error("Usage: npm run seed-url -- <base-url> <seed-json-file>");
  process.exit(1);
}

const seed = JSON.parse(readFileSync(seedFile, "utf8"));
const seedJson = JSON.stringify(seed);
const seedParam = Buffer.from(seedJson, "utf8")
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

const room = randomBytes(16).toString("hex");
const key = randomBytes(32).toString("hex");
const separator = baseUrl.includes("#") ? "&" : "#";

console.log(`${baseUrl}${separator}room=${room}&key=${key}&seed=${seedParam}`);
