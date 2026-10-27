import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { flagSchema, generationSchema } from '@librechat/data-schemas';
import { createMetrics, instrumentMongooseQueryMetrics } from './metrics';

const SECRET = 'oversight-metrics-secret';
const user = new mongoose.Types.ObjectId();

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  mongoose.model('Generation', generationSchema);
  mongoose.model('Flag', flagSchema);
  process.env.METRICS_SECRET = SECRET;
  instrumentMongooseQueryMetrics(mongoose);
});

afterAll(async () => {
  delete process.env.METRICS_SECRET;
  await mongoose.disconnect();
  await mongoServer.stop();
});

async function scrape(): Promise<string> {
  const app = express();
  app.use('/metrics', createMetrics().metricsRouter);
  const response = await request(app).get('/metrics').set('Authorization', `Bearer ${SECRET}`);
  expect(response.status).toBe(200);
  return response.text;
}

describe('oversight_rows_expiring_total', () => {
  it('counts the rows stamped with an expiry per collection at scrape time', async () => {
    const expiredAt = new Date(Date.now() + 86_400_000);
    await mongoose.models.Generation.collection.insertMany([
      { user, conversationId: 'c1', messageId: 'm1', model: 'qwen' },
      { user, conversationId: 'c2', messageId: 'm2', model: 'qwen', expiredAt },
      { user, conversationId: 'c3', messageId: 'm3', model: 'qwen', expiredAt },
    ]);
    await mongoose.models.Flag.collection.insertMany([
      { user, conversationId: 'c1', reason: 'r', source: 'keyword' },
      { user, conversationId: 'c2', reason: 'r', source: 'keyword', expiredAt },
    ]);

    const text = await scrape();

    expect(text).toMatch(/oversight_rows_expiring_total\{collection="generations"\} 2/);
    expect(text).toMatch(/oversight_rows_expiring_total\{collection="flags"\} 1/);
  });
});
