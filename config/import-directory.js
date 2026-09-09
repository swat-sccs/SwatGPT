const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { dormLabel } = require('@librechat/api');
const { createMethods } = require('@librechat/data-schemas');
const { silentExit } = require('./helpers');
const connect = require('./connect');

/**
 * Publishes a student directory snapshot for the "where does X live" lookup.
 *
 * Usage: npm run import-directory -- <snapshot.json>
 *
 * The file is a JSON array produced by `directory_sync/export.mjs` (or by hand):
 *   { "uid": "jdoe1", "firstName": "Jane", "lastName": "Doe", "gradYear": 2027,
 *     "dorm": "Willets", "room": "214", "showProfile": true, "showDorm": true }
 *
 * Students with `showProfile: false` are dropped, students with `showDorm: false`
 * are kept without housing, and students with no dorm (off campus, on leave) are
 * dropped. ITS dorm codes such as `WILLET` are mapped to their display names.
 */

const asText = (value) => (typeof value === 'string' ? value.trim() : '');

const asYear = (value) => {
  const year = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(year) && year > 1900 ? year : undefined;
};

/** @returns {import('@librechat/data-schemas').DirectoryEntry | undefined} */
const toEntry = (row) => {
  const uid = asText(row.uid ?? row.USER_ID).toLowerCase();
  const firstName = asText(row.firstName ?? row.FIRST_NAME);
  const lastName = asText(row.lastName ?? row.LAST_NAME);
  if (!uid || !firstName || !lastName || row.showProfile === false) {
    return undefined;
  }
  const dormHidden = row.showDorm === false;
  const dorm = asText(row.dorm ?? row.DORM);
  const room = asText(row.room ?? row.DORM_ROOM);
  if (!dormHidden && !dorm) {
    return undefined;
  }
  return {
    uid,
    firstName,
    lastName,
    gradYear: asYear(row.gradYear ?? row.GRAD_YEAR),
    dorm: dormHidden ? undefined : dormLabel(dorm),
    room: dormHidden || !room ? undefined : room,
    dormHidden,
  };
};

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.red('Usage: npm run import-directory -- <snapshot.json>');
    silentExit(1);
  }
  const rows = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!Array.isArray(rows)) {
    console.red('Snapshot must be a JSON array');
    silentExit(1);
  }
  const entries = rows.map(toEntry).filter(Boolean);
  console.purple(`Read ${rows.length} rows, ${entries.length} publishable entries`);

  await connect();
  const { replaceDirectory } = createMethods(mongoose);
  const result = await replaceDirectory(entries);
  console.green(
    `Published snapshot ${result.snapshot}: inserted ${result.inserted}, removed ${result.removed} old rows`,
  );
  silentExit(0);
})().catch((error) => {
  console.error(error);
  silentExit(1);
});
