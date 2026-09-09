import { writeFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

/**
 * Runs where the ITS directory database is reachable (gull) and writes the
 * JSON snapshot consumed by `npm run import-directory` on the app host.
 *
 * Environment:
 *   ITS_DB_HOST, ITS_DB_USER, ITS_DB_PASS, ITS_DB_NAME — ITS `student_data` (same values Cygnet uses)
 *   OVERLAY_DB_HOST, OVERLAY_DB_USER, OVERLAY_DB_PASS, OVERLAY_DB_NAME — Cygnet's overlay DB (optional)
 *   OUTPUT — path of the snapshot file (default ./directory.json)
 */

const ITS_QUERY =
  'SELECT USER_ID, FIRST_NAME, LAST_NAME, GRAD_YEAR, DORM, DORM_ROOM FROM student_data WHERE USER_ID IS NOT NULL';
const OVERLAY_QUERY = 'SELECT uid, firstName, lastName, showProfile, showDorm FROM StudentOverlay';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function connection(prefix) {
  return mysql.createConnection({
    host: required(`${prefix}_DB_HOST`),
    user: required(`${prefix}_DB_USER`),
    password: required(`${prefix}_DB_PASS`),
    database: required(`${prefix}_DB_NAME`),
    port: Number(process.env[`${prefix}_DB_PORT`] ?? 3306),
  });
}

async function readRows(prefix, query) {
  const db = await connection(prefix);
  try {
    const [rows] = await db.query(query);
    return rows;
  } finally {
    await db.end();
  }
}

/** ITS blanks every dorm while reloading housing; publishing that would empty the directory. */
function assertNotReloading(rows) {
  const housed = rows.filter((row) => row.DORM).length;
  if (housed === 0) {
    throw new Error(
      'ITS directory has no dorm assignments (reload in progress?); refusing to export',
    );
  }
}

function overlayByUid(rows) {
  return new Map(rows.map((row) => [String(row.uid).toLowerCase(), row]));
}

function toSnapshotRow(row, overlay) {
  const uid = String(row.USER_ID).trim().toLowerCase();
  const custom = overlay.get(uid);
  return {
    uid,
    firstName: custom?.firstName || row.FIRST_NAME,
    lastName: custom?.lastName || row.LAST_NAME,
    gradYear: row.GRAD_YEAR,
    dorm: row.DORM,
    room: row.DORM_ROOM,
    showProfile: custom ? Boolean(custom.showProfile) : true,
    showDorm: custom ? Boolean(custom.showDorm) : true,
  };
}

const students = await readRows('ITS', ITS_QUERY);
assertNotReloading(students);
const overlay = process.env.OVERLAY_DB_HOST
  ? overlayByUid(await readRows('OVERLAY', OVERLAY_QUERY))
  : new Map();
const snapshot = students.map((row) => toSnapshotRow(row, overlay));
const output = process.env.OUTPUT ?? './directory.json';
writeFileSync(output, JSON.stringify(snapshot));
console.log(
  `Wrote ${snapshot.length} students (${overlay.size} overlay rows applied) to ${output}`,
);
