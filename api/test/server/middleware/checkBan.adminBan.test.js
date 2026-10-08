/**
 * Contract between the admin ban API (`createAdminBanService`, as wired in
 * `routes/admin/controls.js`) and the real `checkBan` middleware: both run against
 * the same Mongo-backed stores, so a key, namespace or entry-shape drift fails here.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { ViolationTypes } = require('librechat-data-provider');
const { createAdminBanService } = require('@librechat/api');
const checkBan = require('~/server/middleware/checkBan');
const { getLogStores } = require('~/cache');

const HOUR = 60 * 60 * 1000;
const USER_ID = new mongoose.Types.ObjectId().toString();

let mongoServer;

const createReq = () => ({
  ip: '10.9.8.7',
  user: { id: USER_ID },
  headers: {},
  body: {},
  baseUrl: '/api',
  originalUrl: '/api/convos',
});

const createRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

async function runCheckBan() {
  const res = createRes();
  const next = jest.fn();
  await checkBan(createReq(), res, next);
  return { res, next };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe.each([false, true])('admin bans enforced by checkBan (USE_REDIS=%s)', (useRedis) => {
  let originalEnv;
  let banService;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.BAN_VIOLATIONS = 'true';
    process.env.USE_REDIS = String(useRedis);
    banService = createAdminBanService(getLogStores(ViolationTypes.BAN), { useRedis });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await banService.unban(USER_ID);
    process.env = originalEnv;
  });

  /** Proves the hit came from the enforcement cache key, not the BAN_DURATION-bound log. */
  const spyOnBanLog = () => jest.spyOn(getLogStores(ViolationTypes.BAN), 'get');

  it('blocks a user banned for a duration and lets them back in after unban', async () => {
    await banService.ban(USER_ID, { durationMs: HOUR, reason: 'spam' });
    const banLogGet = spyOnBanLog();

    const banned = await runCheckBan();
    expect(banned.res.status).toHaveBeenCalledWith(403);
    expect(banned.next).not.toHaveBeenCalled();
    expect(banLogGet).not.toHaveBeenCalled();

    await banService.unban(USER_ID);

    const lifted = await runCheckBan();
    expect(lifted.next).toHaveBeenCalledWith();
    expect(lifted.res.status).not.toHaveBeenCalled();
  });

  it('blocks a permanently banned user', async () => {
    await banService.ban(USER_ID, { durationMs: 0 });
    const banLogGet = spyOnBanLog();

    const { res, next } = await runCheckBan();

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(banLogGet).not.toHaveBeenCalled();
  });

  it('does not block a user who was never banned', async () => {
    const { res, next } = await runCheckBan();

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  /**
   * Documents why the controls API reports `banEnforced: false` and the route logs a
   * startup warning when BAN_VIOLATIONS is off. If checkBan starts enforcing admin
   * bans regardless of the flag, update `banEnforced` in routes/admin/controls.js.
   */
  it('skips every ban when BAN_VIOLATIONS is off', async () => {
    process.env.BAN_VIOLATIONS = 'false';
    await banService.ban(USER_ID, { durationMs: HOUR });

    const { res, next } = await runCheckBan();

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
