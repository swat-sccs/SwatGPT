const path = require('path');
const mongoose = require('mongoose');
const { Transaction, Generation } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { silentExit } = require('./helpers');
const connect = require('./connect');

const BATCH_SIZE = 500;

/**
 * Builds one Generation per messageId from the prompt/completion transactions that
 * predate the usage ledger. Idempotent: messageIds that already have a Generation
 * are skipped, so the script can be re-run safely.
 */
const groupedTransactions = () =>
  Transaction.aggregate([
    {
      $match: {
        messageId: { $type: 'string', $ne: '' },
        tokenType: { $in: ['prompt', 'completion'] },
      },
    },
    {
      $group: {
        _id: '$messageId',
        user: { $first: '$user' },
        conversationId: { $first: '$conversationId' },
        model: { $first: '$model' },
        createdAt: { $min: '$createdAt' },
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
    { $match: { user: { $ne: null }, conversationId: { $type: 'string' } } },
  ]).cursor({ batchSize: BATCH_SIZE });

const toGeneration = (row) => ({
  user: row.user,
  conversationId: row.conversationId,
  messageId: row._id,
  model: row.model || 'unknown',
  promptTokens: Math.round(row.promptTokens),
  completionTokens: Math.round(row.completionTokens),
  toolCalls: [],
  ragChunks: 0,
  status: 'ok',
  createdAt: row.createdAt,
  updatedAt: row.createdAt,
});

const flush = async (rows, totals) => {
  if (rows.length === 0) {
    return;
  }
  const existing = await Generation.find(
    { messageId: { $in: rows.map((row) => row._id) } },
    { messageId: 1, _id: 0 },
  ).lean();
  const skip = new Set(existing.map((doc) => doc.messageId));
  const docs = rows.filter((row) => !skip.has(row._id)).map(toGeneration);
  totals.skipped += skip.size;
  if (docs.length === 0) {
    return;
  }
  const result = await Generation.insertMany(docs, { ordered: false });
  totals.inserted += result.length;
};

(async () => {
  await connect();

  console.purple('-----------------------------------------------');
  console.purple('Backfill generations from existing transactions');
  console.purple('-----------------------------------------------');

  const totals = { inserted: 0, skipped: 0 };
  let batch = [];
  for await (const row of groupedTransactions()) {
    batch.push(row);
    if (batch.length < BATCH_SIZE) {
      continue;
    }
    await flush(batch, totals);
    batch = [];
  }
  await flush(batch, totals);

  console.green(`Inserted ${totals.inserted} generations, skipped ${totals.skipped} existing.`);
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:');
  console.error(err);
  process.exit(1);
});
