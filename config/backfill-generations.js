const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const connect = require('./connect');

const BATCH_SIZE = 500;
const SETTLE_MS = 10 * 60 * 1000;

/**
 * Builds one Generation per messageId from the prompt/completion transactions that
 * predate the usage ledger.
 *
 * - Title-generation transactions share the first response's messageId but are not
 *   part of the response, so they are excluded, as in the live ledger.
 * - Transactions are sorted before grouping so user, conversation and model are
 *   chosen deterministically; the model comes from the completion rows.
 * - Messages with transactions newer than `before` are left to the live ledger,
 *   which would otherwise fold its own write into the backfilled row.
 * - Rows are upserted with `$setOnInsert`, so existing Generations are never
 *   modified, re-runs are safe, and a concurrent live insert cannot abort the run.
 */
const groupedTransactions = (Transaction, before) =>
  Transaction.aggregate([
    {
      $match: {
        messageId: { $type: 'string', $ne: '' },
        tokenType: { $in: ['prompt', 'completion'] },
        context: { $ne: 'title' },
      },
    },
    { $sort: { messageId: 1, createdAt: 1, _id: 1 } },
    {
      $group: {
        _id: '$messageId',
        user: { $first: '$user' },
        conversationId: { $first: '$conversationId' },
        completionModel: {
          $max: { $cond: [{ $eq: ['$tokenType', 'completion'] }, '$model', null] },
        },
        anyModel: { $max: '$model' },
        createdAt: { $min: '$createdAt' },
        lastAt: { $max: '$createdAt' },
        promptTokens: {
          $sum: {
            $cond: [{ $eq: ['$tokenType', 'prompt'] }, { $abs: { $ifNull: ['$rawAmount', 0] } }, 0],
          },
        },
        completionTokens: {
          $sum: {
            $cond: [
              { $eq: ['$tokenType', 'completion'] },
              { $abs: { $ifNull: ['$rawAmount', 0] } },
              0,
            ],
          },
        },
      },
    },
    {
      $match: {
        user: { $ne: null },
        conversationId: { $type: 'string' },
        lastAt: { $lt: before },
      },
    },
  ])
    .allowDiskUse(true)
    .cursor({ batchSize: BATCH_SIZE });

const toGeneration = (row) => ({
  user: row.user,
  conversationId: row.conversationId,
  messageId: row._id,
  model: row.completionModel || row.anyModel || 'unknown',
  promptTokens: Math.round(row.promptTokens),
  completionTokens: Math.round(row.completionTokens),
  toolCalls: [],
  ragChunks: 0,
  status: 'ok',
  createdAt: row.createdAt,
  updatedAt: row.createdAt,
});

const toUpsert = (row) => ({
  updateOne: {
    filter: { messageId: row._id },
    update: { $setOnInsert: toGeneration(row) },
    upsert: true,
    timestamps: false,
  },
});

const DUPLICATE_KEY = 11000;

/** The driver reports `writeErrors` as a single error when only one write failed. */
const isDuplicateOnly = (error) => {
  const writeErrors = [error?.writeErrors ?? []].flat();
  return writeErrors.length > 0
    ? writeErrors.every(
        (writeError) => (writeError?.code ?? writeError?.err?.code) === DUPLICATE_KEY,
      )
    : error?.code === DUPLICATE_KEY;
};

/** Upserted count of a bulk write that may have failed only on duplicate keys. */
const upsertedCount = async (Generation, ops) => {
  try {
    const result = await Generation.bulkWrite(ops, { ordered: false });
    return result.upsertedCount;
  } catch (error) {
    if (!isDuplicateOnly(error)) {
      throw error;
    }
    return error.result?.upsertedCount ?? error.result?.nUpserted ?? 0;
  }
};

const flush = async (Generation, rows, totals) => {
  if (rows.length === 0) {
    return;
  }
  const inserted = await upsertedCount(Generation, rows.map(toUpsert));
  totals.inserted += inserted;
  totals.skipped += rows.length - inserted;
};

/**
 * @param {{ Transaction: import('mongoose').Model<unknown>, Generation: import('mongoose').Model<unknown>, before?: Date }} params
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
const backfillGenerations = async ({
  Transaction,
  Generation,
  before = new Date(Date.now() - SETTLE_MS),
}) => {
  const totals = { inserted: 0, skipped: 0 };
  let batch = [];
  for await (const row of groupedTransactions(Transaction, before)) {
    batch.push(row);
    if (batch.length < BATCH_SIZE) {
      continue;
    }
    await flush(Generation, batch, totals);
    batch = [];
  }
  await flush(Generation, batch, totals);
  return totals;
};

module.exports = { backfillGenerations };

if (require.main === module) {
  (async () => {
    await connect();
    const { Transaction, Generation } = createModels(mongoose);

    console.purple('-----------------------------------------------');
    console.purple('Backfill generations from existing transactions');
    console.purple('-----------------------------------------------');

    const totals = await backfillGenerations({ Transaction, Generation });

    console.green(`Inserted ${totals.inserted} generations, skipped ${totals.skipped} existing.`);
    silentExit(0);
  })().catch((error) => {
    console.error('There was an uncaught error:');
    console.error(error);
    silentExit(1);
  });
}
