import { Types } from 'mongoose';
import type { IUser, IConversation, UsageSummary } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminUsageDeps } from './usage';
import { createAdminUsageHandlers } from './usage';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const FROM = '2026-09-01T00:00:00.000Z';
const TO = '2026-09-02T00:00:00.000Z';

const SUMMARY: UsageSummary = {
  requests: 10,
  errors: 1,
  aborted: 2,
  promptTokens: 1000,
  completionTokens: 200,
  uniqueUsers: 3,
  conversations: 4,
  ttftMs: { p50: 100, p95: 400 },
  durationMs: { p50: 1000, p95: 4000 },
  outputTokensPerSec: 20,
  ragHitRate: 0.5,
  toolCallRate: 0.1,
  lastActiveAt: new Date('2026-09-01T12:00:00.000Z'),
};

function createReqRes(
  overrides: { params?: Record<string, string>; query?: Record<string, string | string[]> } = {},
) {
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: {},
    user: { _id: new Types.ObjectId(), role: 'ADMIN' },
  } as unknown as ServerRequest;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { req, res, status, json };
}

function createDeps(overrides: Partial<AdminUsageDeps> = {}): AdminUsageDeps {
  return {
    getUsageSummary: jest.fn().mockResolvedValue(SUMMARY),
    getUsageTimeseries: jest.fn().mockResolvedValue([]),
    getUsageByUser: jest.fn().mockResolvedValue({ users: [], total: 0 }),
    getUsageByModel: jest.fn().mockResolvedValue([]),
    getConversationUsage: jest.fn().mockResolvedValue(new Map()),
    findUser: jest.fn().mockResolvedValue(null),
    findRecentConversations: jest.fn().mockResolvedValue([]),
    getConversationStats: jest.fn().mockResolvedValue(new Map()),
    countFlags: jest.fn().mockResolvedValue(0),
    countFlagsByUser: jest.fn().mockResolvedValue(new Map()),
    countFlagsByConversation: jest.fn().mockResolvedValue(new Map()),
    isUserBanned: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('createAdminUsageHandlers', () => {
  describe('summary', () => {
    it('returns the summary for an explicit range with the flag count', async () => {
      const deps = createDeps({ countFlags: jest.fn().mockResolvedValue(3) });
      const { req, res, status, json } = createReqRes({ query: { from: FROM, to: TO } });
      await createAdminUsageHandlers(deps).summary(req, res);
      expect(deps.getUsageSummary).toHaveBeenCalledWith({ from: new Date(FROM), to: new Date(TO) });
      expect(status).toHaveBeenCalledWith(200);
      const body = json.mock.calls[0][0];
      expect(body).toMatchObject({ from: FROM, to: TO, requests: 10, flagged: 3 });
      expect(body).not.toHaveProperty('lastActiveAt');
    });

    it('defaults to the trailing 24 hours', async () => {
      const deps = createDeps();
      const { req, res } = createReqRes();
      const before = Date.now();
      await createAdminUsageHandlers(deps).summary(req, res);
      const [{ from, to }] = (deps.getUsageSummary as jest.Mock).mock.calls[0];
      expect(to.getTime()).toBeGreaterThanOrEqual(before);
      expect(to.getTime() - from.getTime()).toBe(24 * 3_600_000);
    });

    it('rejects malformed and inverted ranges', async () => {
      const handlers = createAdminUsageHandlers(createDeps());
      const bad = createReqRes({ query: { from: 'yesterday' } });
      await handlers.summary(bad.req, bad.res);
      expect(bad.status).toHaveBeenCalledWith(400);
      const inverted = createReqRes({ query: { from: TO, to: FROM } });
      await handlers.summary(inverted.req, inverted.res);
      expect(inverted.status).toHaveBeenCalledWith(400);
    });

    it('returns 500 when the aggregation fails', async () => {
      const deps = createDeps({ getUsageSummary: jest.fn().mockRejectedValue(new Error('x')) });
      const { req, res, status } = createReqRes();
      await createAdminUsageHandlers(deps).summary(req, res);
      expect(status).toHaveBeenCalledWith(500);
    });
  });

  describe('timeseries', () => {
    it('zero-fills missing buckets and formats timestamps', async () => {
      const deps = createDeps({
        getUsageTimeseries: jest.fn().mockResolvedValue([
          {
            t: new Date('2026-09-01T01:00:00.000Z'),
            requests: 2,
            errors: 0,
            promptTokens: 10,
            completionTokens: 5,
            uniqueUsers: 1,
            ttftP50Ms: 100,
            durationP95Ms: 900,
          },
        ]),
      });
      const { req, res, json } = createReqRes({
        query: { from: '2026-09-01T00:30:00.000Z', to: '2026-09-01T03:00:00.000Z' },
      });
      await createAdminUsageHandlers(deps).timeseries(req, res);
      expect(deps.getUsageTimeseries).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'hour' }),
      );
      const body = json.mock.calls[0][0];
      expect(body.bucket).toBe('hour');
      expect(body.points.map((p: { t: string; requests: number }) => [p.t, p.requests])).toEqual([
        ['2026-09-01T00:00:00.000Z', 0],
        ['2026-09-01T01:00:00.000Z', 2],
        ['2026-09-01T02:00:00.000Z', 0],
      ]);
      expect(body.points[1]).toMatchObject({ ttftP50Ms: 100, durationP95Ms: 900 });
      expect(body.points[0]).toMatchObject({ ttftP50Ms: null, durationP95Ms: null });
    });

    it('limits hour buckets to 90 days and validates the bucket name', async () => {
      const handlers = createAdminUsageHandlers(createDeps());
      const tooLong = createReqRes({
        query: { from: '2026-01-01T00:00:00.000Z', to: '2026-06-01T00:00:00.000Z' },
      });
      await handlers.timeseries(tooLong.req, tooLong.res);
      expect(tooLong.status).toHaveBeenCalledWith(400);

      const days = createReqRes({
        query: { from: '2026-01-01T00:00:00.000Z', to: '2026-06-01T00:00:00.000Z', bucket: 'day' },
      });
      await handlers.timeseries(days.req, days.res);
      expect(days.status).toHaveBeenCalledWith(200);
      expect(days.json.mock.calls[0][0].points).toHaveLength(151);

      const bogus = createReqRes({ query: { bucket: 'week' } });
      await handlers.timeseries(bogus.req, bogus.res);
      expect(bogus.status).toHaveBeenCalledWith(400);
    });
  });

  describe('users', () => {
    it('lists users with flags, bans, and pagination', async () => {
      const userId = new Types.ObjectId().toString();
      const deps = createDeps({
        getUsageByUser: jest.fn().mockResolvedValue({
          total: 7,
          users: [
            {
              userId,
              name: 'Alice',
              username: 'alice',
              email: 'alice@swarthmore.edu',
              role: 'USER',
              requests: 5,
              errors: 1,
              promptTokens: 500,
              completionTokens: 50,
              conversations: 2,
              lastActiveAt: new Date('2026-09-01T10:00:00.000Z'),
            },
          ],
        }),
        countFlagsByUser: jest.fn().mockResolvedValue(new Map([[userId, 2]])),
        isUserBanned: jest.fn().mockResolvedValue(true),
      });
      const { req, res, json } = createReqRes({
        query: { from: FROM, to: TO, sort: 'errors', limit: '5', offset: '10', search: ' ali ' },
      });
      await createAdminUsageHandlers(deps).users(req, res);
      expect(deps.getUsageByUser).toHaveBeenCalledWith({
        from: new Date(FROM),
        to: new Date(TO),
        sort: 'errors',
        limit: 5,
        offset: 10,
        search: 'ali',
      });
      expect(deps.isUserBanned).toHaveBeenCalledWith(userId);
      expect(json).toHaveBeenCalledWith({
        users: [
          expect.objectContaining({
            id: userId,
            name: 'Alice',
            flagged: 2,
            banned: true,
            lastActiveAt: '2026-09-01T10:00:00.000Z',
          }),
        ],
        total: 7,
        limit: 5,
        offset: 10,
      });
    });

    it('rejects an unknown sort and an oversized search', async () => {
      const handlers = createAdminUsageHandlers(createDeps());
      const sort = createReqRes({ query: { sort: 'name' } });
      await handlers.users(sort.req, sort.res);
      expect(sort.status).toHaveBeenCalledWith(400);
      const search = createReqRes({ query: { search: 'a'.repeat(201) } });
      await handlers.users(search.req, search.res);
      expect(search.status).toHaveBeenCalledWith(400);
    });
  });

  describe('user', () => {
    const userId = new Types.ObjectId();
    const user = {
      _id: userId,
      name: 'Alice',
      username: 'alice',
      email: 'alice@swarthmore.edu',
      role: 'USER',
    } as IUser;
    const conversation = {
      conversationId: 'c1',
      title: 'Lunch',
      model: 'qwen3',
      createdAt: new Date('2026-09-01T09:00:00.000Z'),
      updatedAt: new Date('2026-09-01T09:30:00.000Z'),
    } as IConversation;

    it('assembles the detail view', async () => {
      const deps = createDeps({
        findUser: jest.fn().mockResolvedValue(user),
        findRecentConversations: jest.fn().mockResolvedValue([conversation]),
        getConversationUsage: jest
          .fn()
          .mockResolvedValue(
            new Map([['c1', { requests: 3, promptTokens: 300, completionTokens: 30, errors: 1 }]]),
          ),
        getConversationStats: jest
          .fn()
          .mockResolvedValue(new Map([['c1', { messageCount: 6, up: 1, down: 0 }]])),
        countFlagsByConversation: jest.fn().mockResolvedValue(new Map([['c1', 1]])),
        countFlags: jest.fn().mockResolvedValue(1),
      });
      const { req, res, json } = createReqRes({
        params: { id: userId.toString() },
        query: { from: FROM, to: TO },
      });
      await createAdminUsageHandlers(deps).user(req, res);
      const scoped = { from: new Date(FROM), to: new Date(TO), userId: userId.toString() };
      expect(deps.getUsageSummary).toHaveBeenCalledWith(scoped);
      expect(deps.getUsageTimeseries).toHaveBeenCalledWith({ ...scoped, bucket: 'hour' });
      expect(deps.findRecentConversations).toHaveBeenCalledWith(userId.toString(), 20);
      expect(deps.findUser).toHaveBeenCalledTimes(1);
      const body = json.mock.calls[0][0];
      expect(body.user).toEqual({
        id: userId.toString(),
        name: 'Alice',
        username: 'alice',
        email: 'alice@swarthmore.edu',
        role: 'USER',
        requests: 10,
        errors: 1,
        promptTokens: 1000,
        completionTokens: 200,
        conversations: 4,
        flagged: 1,
        lastActiveAt: '2026-09-01T12:00:00.000Z',
        banned: false,
      });
      expect(body.summary).toMatchObject({ from: FROM, to: TO, requests: 10, flagged: 1 });
      expect(body.timeseries.points).toHaveLength(24);
      expect(body.recentConversations).toEqual([
        {
          conversationId: 'c1',
          title: 'Lunch',
          user: { id: userId.toString(), name: 'Alice', email: 'alice@swarthmore.edu' },
          model: 'qwen3',
          messageCount: 6,
          promptTokens: 300,
          completionTokens: 30,
          errors: 1,
          flagged: true,
          feedback: { up: 1, down: 0 },
          createdAt: '2026-09-01T09:00:00.000Z',
          updatedAt: '2026-09-01T09:30:00.000Z',
        },
      ]);
    });

    it('returns 404 for a missing user and 400 for a malformed id', async () => {
      const handlers = createAdminUsageHandlers(createDeps());
      const missing = createReqRes({ params: { id: userId.toString() } });
      await handlers.user(missing.req, missing.res);
      expect(missing.status).toHaveBeenCalledWith(404);
      const malformed = createReqRes({ params: { id: 'nope' } });
      await handlers.user(malformed.req, malformed.res);
      expect(malformed.status).toHaveBeenCalledWith(400);
    });
  });

  describe('models', () => {
    it('returns model rows for the range', async () => {
      const rows = [
        {
          model: 'qwen3',
          requests: 4,
          promptTokens: 40,
          completionTokens: 4,
          ttftMs: { p50: 1, p95: 2 },
          durationMs: { p50: 3, p95: 4 },
        },
      ];
      const deps = createDeps({ getUsageByModel: jest.fn().mockResolvedValue(rows) });
      const { req, res, json } = createReqRes({ query: { from: FROM, to: TO } });
      await createAdminUsageHandlers(deps).models(req, res);
      expect(deps.getUsageByModel).toHaveBeenCalledWith({ from: new Date(FROM), to: new Date(TO) });
      expect(json).toHaveBeenCalledWith({ models: rows });
    });
  });
});
