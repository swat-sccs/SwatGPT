import { Keyv } from 'keyv';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PAUSE_NAMESPACE, getPauseService, createPauseService, PAUSE_READ_CACHE_MS } from './pause';
import { keyvMongo } from '~/cache';

let mongoServer: MongoMemoryServer;

function freshProcessService() {
  return createPauseService(new Keyv({ store: keyvMongo, namespace: PAUSE_NAMESPACE, ttl: 0 }));
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe('getPauseService (Mongo-backed)', () => {
  it('keeps a pause across a restart', async () => {
    await getPauseService().setState({
      paused: true,
      message: 'Incident in progress',
      updatedBy: 'admin-1',
    });

    await expect(freshProcessService().getState()).resolves.toMatchObject({
      paused: true,
      message: 'Incident in progress',
      updatedBy: 'admin-1',
    });
  });

  it('does not let the entry expire', async () => {
    await getPauseService().setState({ paused: true, updatedBy: 'admin-1' });

    const doc = await mongoose.connection
      .collection('logs')
      .findOne({ key: { $regex: `^${PAUSE_NAMESPACE}:` } });
    expect(doc).not.toBeNull();
    expect(doc?.expiresAt).toBeNull();
    const raw = JSON.parse(String(doc?.value)) as { expires?: number };
    expect(raw.expires).toBeUndefined();
  });

  it('sees a resume written by another process', async () => {
    const shared = getPauseService();
    await shared.setState({ paused: true, updatedBy: 'admin-1' });

    await freshProcessService().setState({ paused: false, updatedBy: 'admin-2' });

    await expect(freshProcessService().getState()).resolves.toMatchObject({
      paused: false,
      updatedBy: 'admin-2',
    });
  });

  it('throws on a store read failure instead of reading as running', async () => {
    await getPauseService().setState({ paused: true, updatedBy: 'admin-1' });
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + PAUSE_READ_CACHE_MS + 1);
    jest.spyOn(keyvMongo, 'get').mockRejectedValueOnce(new Error('mongo down'));

    await expect(getPauseService().getState()).rejects.toThrow('mongo down');
  });
});
