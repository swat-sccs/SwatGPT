import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, auditLogSchema } from '@librechat/data-schemas';
import type { IAuditLog } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { Model } from 'mongoose';
import type { ServerRequest } from '~/types/http';
import { createAdminConversationsHandlers } from './conversations';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const adminId = new Types.ObjectId();

let mongoServer: MongoMemoryServer;
let recordAuditEntry: ReturnType<typeof createMethods>['recordAuditEntry'];
let AuditLog: Model<IAuditLog>;

function searchRequest(search: string) {
  const req = {
    params: {},
    query: { search },
    body: {},
    headers: { 'user-agent': 'jest', 'x-request-id': 'req-search' },
    ip: '10.0.0.2',
    user: { _id: adminId, name: 'Admin' },
  } as unknown as ServerRequest;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { req, res, status, json };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
  await AuditLog.init();
  recordAuditEntry = createMethods(mongoose).recordAuditEntry;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

describe('admin conversation search auditing (real audit log)', () => {
  it('persists a fail-closed conversation.searched entry for a zero-hit search', async () => {
    const deps = {
      listConversationsAdmin: jest.fn(),
      getConversationAdmin: jest.fn(),
      findConversationOwner: jest.fn(),
      searchMessagesAdmin: jest.fn().mockResolvedValue([]),
      searchMessageTextAdmin: jest.fn(),
      createFlagAdmin: jest.fn(),
      deleteFlag: jest.fn(),
      recordAuditEntry,
      auditFailClosed: true,
    };
    const handlers = createAdminConversationsHandlers(deps);
    const { req, res, status, json } = searchRequest('immigration status');

    await handlers.listConversations(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ conversations: [], nextCursor: null });
    expect(deps.listConversationsAdmin).not.toHaveBeenCalled();
    const entries = await AuditLog.find({}).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'conversation.searched',
      category: 'conversation',
      outcome: 'success',
      actor: { type: 'user', id: adminId.toString(), name: 'Admin' },
      target: { type: 'search', name: 'immigration status' },
      metadata: { query: 'immigration status', scopeSize: 0, returned: 0 },
      context: { requestId: 'req-search', ip: '10.0.0.2' },
    });
  });
});
