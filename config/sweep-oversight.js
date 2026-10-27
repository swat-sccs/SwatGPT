const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const connect = require('./connect');

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_ENV = 'OVERSIGHT_RETENTION_DAYS';

/** Positive whole number of days, from `--days N` or `OVERSIGHT_RETENTION_DAYS`. */
const parseDays = (argv = process.argv.slice(2), env = process.env[RETENTION_ENV]) => {
  const flagAt = argv.indexOf('--days');
  const raw = flagAt >= 0 ? argv[flagAt + 1] : env;
  const days = Number(raw);
  return Number.isInteger(days) && days > 0 ? days : null;
};

/**
 * Stamps `expiredAt = createdAt + days` onto generations and flags that predate the
 * retention window (rows written without an expiry), so the existing TTL indexes remove
 * them. Rows that already carry an expiry (temporary conversations) are left alone.
 *
 * @param {{ Generation: import('mongoose').Model<unknown>, Flag: import('mongoose').Model<unknown>, days: number, dryRun?: boolean }} params
 * @returns {Promise<{ generations: number, flags: number }>}
 */
const sweepOversight = async ({ Generation, Flag, days, dryRun = false }) => {
  const filter = { expiredAt: null };
  const update = [{ $set: { expiredAt: { $add: ['$createdAt', days * DAY_MS] } } }];
  const stamp = async (Model) => {
    if (dryRun) {
      return Model.countDocuments(filter);
    }
    const result = await Model.updateMany(filter, update, { timestamps: false });
    return result.modifiedCount;
  };
  return { generations: await stamp(Generation), flags: await stamp(Flag) };
};

module.exports = { sweepOversight, parseDays };

if (require.main === module) {
  (async () => {
    const days = parseDays();
    if (days == null) {
      console.red(`Set ${RETENTION_ENV} or pass --days N (a positive whole number).`);
      silentExit(1);
      return;
    }
    const dryRun = process.argv.includes('--dry-run');
    await connect();
    const { Generation, Flag } = createModels(mongoose);

    console.purple('-----------------------------------------------');
    console.purple(`Stamp oversight rows with a ${days}-day expiry${dryRun ? ' (dry run)' : ''}`);
    console.purple('-----------------------------------------------');

    const totals = await sweepOversight({ Generation, Flag, days, dryRun });

    console.green(
      `${dryRun ? 'Would stamp' : 'Stamped'} ${totals.generations} generations and ${totals.flags} flags.`,
    );
    silentExit(0);
  })().catch((error) => {
    console.error('There was an uncaught error:');
    console.error(error);
    silentExit(1);
  });
}
