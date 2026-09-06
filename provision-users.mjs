#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

async function loadEnvFile(path) {
  try {
    const text = await fs.readFile(path, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      let value = rawValue.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await loadEnvFile(".env.local");
await loadEnvFile(".env");

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const domain = process.env.AUTH_INTERNAL_EMAIL_DOMAIN || "internal.local";
const roles = new Set(["supplier", "qc_backend", "pm_pic", "superadmin"]);

if (!url) {
  console.error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  process.exit(1);
}

// Auth Admin POST endpoints may reject the newer sb_secret_* key in older
// @supabase/supabase-js / Auth gateway combinations. For batch provisioning,
// use the legacy service_role key when available; keep it server-side only.
if (!serviceRoleKey) {
  if (secretKey?.startsWith("sb_secret_")) {
    console.error("SUPABASE_SECRET_KEY detected, but this batch script requires SUPABASE_SERVICE_ROLE_KEY for Auth Admin create/update with the current SDK/Auth endpoint.");
    console.error("Add the legacy service_role key to your local environment and rerun. Do NOT put it in NEXT_PUBLIC_*.");
    process.exit(1);
  }
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local (or the shell environment).");
  process.exit(1);
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node scripts/provision-users.mjs scripts/users.csv");
  process.exit(1);
}

function csvLine(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i], n = line[i + 1];
    if (c === '"') {
      if (quoted && n === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      cells.push(cur.trim()); cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new Error("CSV must contain a header and at least one user row.");

  const headers = csvLine(lines[0]).map((x) => x.toLowerCase());
  for (const h of ["user_code", "full_name", "role", "password"]) {
    if (!headers.includes(h)) throw new Error(`Missing required column: ${h}`);
  }

  return lines.slice(1).map((line, i) => {
    const values = csvLine(line);
    return {
      ...Object.fromEntries(headers.map((h, j) => [h, values[j] ?? ""])),
      line: i + 2,
    };
  });
}

function code(value) {
  return String(value || "").trim().toUpperCase();
}

function active(value) {
  return value === undefined || value === ""
    ? true
    : !["false", "0", "no", "inactive"].includes(String(value).trim().toLowerCase());
}

function emailFor(userCode) {
  return `${userCode.toLowerCase().replace(/[^a-z0-9._-]/g, "")}@${domain}`;
}

const text = await fs.readFile(csvPath, "utf8");
const rows = parseCsv(text);
const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

let failed = 0;

console.log(`Provisioning ${rows.length} user(s)...`);

for (const row of rows) {
  const userCode = code(row.user_code);
  const fullName = String(row.full_name || "").trim();
  const role = String(row.role || "").trim().toLowerCase();
  const password = String(row.password || "");
  const isActive = active(row.is_active);
  const email = String(row.email || emailFor(userCode)).trim().toLowerCase();

  try {
    if (!userCode || !fullName || !password) {
      throw new Error("user_code, full_name, and password are required.");
    }
    if (!roles.has(role)) throw new Error(`Invalid role: ${role}`);
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (!email.includes("@")) throw new Error("email is invalid.");

    const { data: existing, error: lookupError } = await supabase
      .from("users")
      .select("id")
      .eq("user_code", userCode)
      .maybeSingle();
    if (lookupError) throw lookupError;

    let id;
    let action;
    let createdAuthUser = false;

    if (existing?.id) {
      const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
        email,
        password,
        email_confirm: true,
        user_metadata: { user_code: userCode, full_name: fullName },
      });
      if (error) throw error;
      id = data.user.id;
      action = "updated";
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { user_code: userCode, full_name: fullName },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Auth creation returned no user.");
      id = data.user.id;
      action = "created";
      createdAuthUser = true;
    }

    const { error: upsertError } = await supabase.from("users").upsert(
      {
        id,
        user_code: userCode,
        full_name: fullName,
        role,
        is_active: isActive,
      },
      { onConflict: "id" },
    );

    if (upsertError) {
      // Avoid leaving an orphaned Auth user when this was a new creation.
      if (createdAuthUser) {
        await supabase.auth.admin.deleteUser(id).catch(() => undefined);
      }
      throw upsertError;
    }

    console.log(`OK   ${userCode} ${role} ${action}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERR  ${userCode || `<line ${row.line}>`} ${message}`);
  }
}

console.log(`\nFinished. ${rows.length - failed} OK, ${failed} ERROR.`);
if (failed) process.exitCode = 2;
