import { Types } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import { SystemCapabilities } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminCapabilitiesDeps } from './capabilities';
import { createAdminCapabilitiesHandlers } from './capabilities';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

function createReqRes(user?: Record<string, unknown>) {
  const req = { params: {}, query: {}, body: {}, user } as unknown as ServerRequest;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { req, res, status, json };
}

function createDeps(overrides: Partial<AdminCapabilitiesDeps> = {}): AdminCapabilitiesDeps {
  return {
    getUserPrincipals: jest.fn().mockResolvedValue([]),
    getHeldCapabilities: jest.fn().mockResolvedValue(new Set()),
    ...overrides,
  };
}

describe('createAdminCapabilitiesHandlers', () => {
  it('returns the sorted held capabilities for the caller', async () => {
    const userId = new Types.ObjectId();
    const principals = [{ principalType: PrincipalType.USER, principalId: userId }];
    const deps = createDeps({
      getUserPrincipals: jest.fn().mockResolvedValue(principals),
      getHeldCapabilities: jest
        .fn()
        .mockResolvedValue(
          new Set([SystemCapabilities.READ_USAGE, SystemCapabilities.ACCESS_ADMIN]),
        ),
    });
    const { req, res, status, json } = createReqRes({
      _id: userId,
      id: userId.toString(),
      role: 'ADMIN',
      tenantId: 't1',
    });

    await createAdminCapabilitiesHandlers(deps).getCapabilities(req, res);

    expect(deps.getUserPrincipals).toHaveBeenCalledWith({
      userId: userId.toString(),
      role: 'ADMIN',
      idOnTheSource: null,
    });
    expect(deps.getHeldCapabilities).toHaveBeenCalledWith({
      principals,
      capabilities: expect.arrayContaining(Object.values(SystemCapabilities)),
      tenantId: 't1',
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ capabilities: ['access:admin', 'read:usage'] });
  });

  it('returns an empty list for users with no grants', async () => {
    const { req, res, json } = createReqRes({ _id: new Types.ObjectId(), role: 'USER' });
    await createAdminCapabilitiesHandlers(createDeps()).getCapabilities(req, res);
    expect(json).toHaveBeenCalledWith({ capabilities: [] });
  });

  it('rejects unauthenticated requests', async () => {
    const { req, res, status } = createReqRes(undefined);
    await createAdminCapabilitiesHandlers(createDeps()).getCapabilities(req, res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 500 when the lookup fails', async () => {
    const deps = createDeps({ getUserPrincipals: jest.fn().mockRejectedValue(new Error('db')) });
    const { req, res, status } = createReqRes({ id: new Types.ObjectId().toString() });
    await createAdminCapabilitiesHandlers(deps).getCapabilities(req, res);
    expect(status).toHaveBeenCalledWith(500);
  });
});
