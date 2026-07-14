import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "revive-keyring-"));
const keyringFile = path.join(directory, "keys.json");
const oldKey = crypto.randomBytes(32).toString("base64");
const newKey = crypto.randomBytes(32).toString("base64");
fs.writeFileSync(keyringFile, JSON.stringify({ old: oldKey, current: newKey }), { mode: 0o600 });
process.env.REVIVE_ENCRYPTION_KEYS_FILE = keyringFile;
delete process.env.REVIVE_ENCRYPTION_KEYS;

const { sealJson, openJson } = await import("../lib/secure-envelope.ts");
process.env.REVIVE_ACTIVE_ENCRYPTION_KEY_ID = "old";
const oldEnvelope = sealJson({ token: "never-logged" }, "rotation-test");
assert(oldEnvelope.startsWith("v2.old."));

process.env.REVIVE_ACTIVE_ENCRYPTION_KEY_ID = "current";
assert.deepEqual(openJson(oldEnvelope, "rotation-test"), { token: "never-logged" });
const currentEnvelope = sealJson(openJson(oldEnvelope, "rotation-test"), "rotation-test");
assert(currentEnvelope.startsWith("v2.current."));
assert.deepEqual(openJson(currentEnvelope, "rotation-test"), { token: "never-logged" });
assert.throws(() => openJson(currentEnvelope, "wrong-purpose"));

fs.rmSync(directory, { recursive: true, force: true });
console.log("encryption rotation: old decrypt + current rewrap + AAD rejection passed");

