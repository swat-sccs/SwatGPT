const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { getPauseService } = require('@librechat/api');
const { PrincipalType } = require('librechat-data-provider');
const { SystemCapabilities } = require('@librechat/data-schemas');
const checkPaused = require('../checkPaused');
const db = require('~/models');
require('~/db/models');

let mongoServer;

const createRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

async function run(req = {}) {
  const res = createRes();
  const next = jest.fn();
  await checkPaused(req, res, next);
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

afterEach(async () => {
  jest.restoreAllMocks();
  await getPauseService().setState({ paused: false, updatedBy: null });
});

describe('checkPaused', () => {
  it('lets requests through while running', async () => {
    const { res, next } = await run();

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects with a 4xx body the chat client renders as the admin message', async () => {
    await getPauseService().setState({
      paused: true,
      message: 'Back at 5pm.',
      updatedBy: 'admin-1',
    });

    const { res, next } = await run();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(423);
    expect(res.json).toHaveBeenCalledWith({
      type: ErrorTypes.GOOGLE_ERROR,
      info: 'Back at 5pm.',
      error: 'paused',
      message: 'Back at 5pm.',
    });
  });

  it('lets a manage:controls holder through so a pause can be verified', async () => {
    const adminId = new mongoose.Types.ObjectId();
    await db.grantCapability({
      principalType: PrincipalType.USER,
      principalId: adminId,
      capability: SystemCapabilities.MANAGE_CONTROLS,
    });
    await getPauseService().setState({ paused: true, updatedBy: 'admin-1' });

    const admin = await run({ user: { id: adminId.toString(), role: 'USER' } });
    expect(admin.next).toHaveBeenCalledWith();
    expect(admin.res.status).not.toHaveBeenCalled();

    const student = await run({
      user: { id: new mongoose.Types.ObjectId().toString(), role: 'USER' },
    });
    expect(student.next).not.toHaveBeenCalled();
    expect(student.res.status).toHaveBeenCalledWith(423);
  });

  it('lets requests through again right after a resume', async () => {
    await getPauseService().setState({ paused: true, updatedBy: 'admin-1' });
    await getPauseService().setState({ paused: false, updatedBy: 'admin-1' });

    const { next } = await run();

    expect(next).toHaveBeenCalledWith();
  });

  it('fails open and logs when the pause state cannot be read', async () => {
    jest.spyOn(getPauseService(), 'getState').mockRejectedValueOnce(new Error('mongo down'));
    const error = jest.spyOn(logger, 'error');

    const { res, next } = await run();

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      '[checkPaused] Failed to read pause state:',
      expect.any(Error),
    );
  });
});
