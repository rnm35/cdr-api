// creates tables, imports the spreadsheet and creates the admin/analyst accounts
// usage: npm run db:setup [-- path/to/file.xlsx]

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { pool, query } from "../src/db.js";
import { createUser } from "../src/services/users.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const spreadsheet = process.argv[2] || path.join(root, "data", "mock_call_records_10000.xlsx");
const BATCH_SIZE = 500;

const COLUMNS = [
  "callerName", "callerNumber", "receiverNumber", "city", "callDirection",
  "callStatus", "callDuration", "callCost", "callStartTime", "callEndTime", "id",
];

const toBoolean = (value) => value === true || String(value).trim().toLowerCase() === "true";
const cleanText = (value) => String(value ?? "").trim();

function toCallRow(record) {
  const id = Number(record.id);
  const duration = Number(record.callDuration);
  const cost = Number.parseFloat(record.callCost);
  const start = new Date(record.callStartTime);
  const end = new Date(record.callEndTime);

  if (!Number.isInteger(id) || id < 1) return { problem: "invalid id" };
  if (!Number.isFinite(duration) || duration < 0) return { problem: "invalid duration" };
  if (!Number.isFinite(cost) || cost < 0) return { problem: "invalid cost" };
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { problem: "invalid timestamp" };

  return {
    row: [
      id,
      cleanText(record.callerName),
      cleanText(record.callerNumber).replace(/\s/g, ""),
      cleanText(record.receiverNumber).replace(/\s/g, ""),
      cleanText(record.city),
      toBoolean(record.callDirection) ? "inbound" : "outbound",
      toBoolean(record.callStatus) ? "successful" : "failed",
      Math.round(duration),
      cost.toFixed(2),
      start.toISOString(),
      end.toISOString(),
    ],
  };
}

async function readCalls(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.getWorksheet("Calls") ?? workbook.worksheets[0];

  // match columns by header name
  const headers = {};
  sheet.getRow(1).eachCell((cell, column) => {
    headers[cleanText(cell.value)] = column;
  });
  const missing = COLUMNS.filter((name) => !headers[name]);
  if (missing.length) throw new Error(`Spreadsheet is missing columns: ${missing.join(", ")}`);

  const rows = [];
  const problems = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = Object.fromEntries(COLUMNS.map((name) => [name, row.getCell(headers[name]).value]));
    const result = toCallRow(record);
    if (result.row) rows.push(result.row);
    else problems.push(`row ${rowNumber}: ${result.problem}`);
  });
  return { rows, problems };
}

async function insertCalls(rows) {
  let inserted = 0;
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const placeholders = batch
      .map((_, r) => `(${Array.from({ length: 11 }, (_, c) => `$${r * 11 + c + 1}`).join(", ")})`)
      .join(", ");
    const result = await query(
      `INSERT INTO calls (id, caller_name, caller_number, receiver_number, city, direction, status,
                          duration_seconds, cost, start_time, end_time)
       VALUES ${placeholders}
       ON CONFLICT (id) DO NOTHING`,
      batch.flat()
    );
    inserted += result.rowCount;
  }
  return inserted;
}

async function ensureUser(name, email, password, role) {
  if (!email || !password) {
    console.log(`Skipped the ${role} account: set ${role.toUpperCase()}_EMAIL and ${role.toUpperCase()}_PASSWORD in .env.`);
    return;
  }
  const { rows } = await query("SELECT id FROM users WHERE lower(email) = lower($1)", [email]);
  if (rows.length) {
    console.log(`The ${role} account ${email} already exists.`);
    return;
  }
  const fallbackName = role === "admin" ? "Admin User" : "Analyst User";
  await createUser({ name: name || fallbackName, email: email.toLowerCase(), password, role });
  console.log(`Created the ${role} account ${email}.`);
}

async function main() {
  console.log("Creating tables...");
  await query(await readFile(path.join(root, "db", "schema.sql"), "utf8"));

  console.log(`Reading ${spreadsheet}...`);
  const { rows, problems } = await readCalls(spreadsheet);
  if (problems.length) console.warn(`Skipped ${problems.length} invalid rows, e.g. ${problems.slice(0, 3).join("; ")}`);

  const inserted = await insertCalls(rows);
  console.log(`Imported ${inserted} new calls (${rows.length - inserted} were already in the database).`);
  await query("ANALYZE calls");

  const env = process.env;
  await ensureUser(env.ADMIN_NAME, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, "admin");
  await ensureUser(env.ANALYST_NAME, env.ANALYST_EMAIL, env.ANALYST_PASSWORD, "analyst");
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
