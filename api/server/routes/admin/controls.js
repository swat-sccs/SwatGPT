const express = require('express');
const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const { CacheKeys, ViolationTypes } = require('librechat-data-provider');
const {
  isEnabled,
  getPauseService,
  getBalanceConfig,
  createAdminBanService,
  invalidateCachedAuthUserDoc,
  createAdminControlsHandlers,
} = require('@librechat/api');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { getAppConfig } = require('~/server/services/Config');
const { requireJwtAuth } = require('~/server/middleware');
const { getLogStores } = require('~/cache');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireManageControls = requireCapability(SystemCapabilities.MANAGE_CONTROLS);

const banEnforced = isEnabled(process.env.BAN_VIOLATIONS);
if (!banEnforced) {
  logger.warn(
    '[adminControls] BAN_VIOLATIONS is not enabled: checkBan skips every ban check, so admin bans from /api/admin/controls will be recorded but NOT enforced. Set BAN_VIOLATIONS=true.',
  );
}

const handlers = createAdminControlsHandlers({
  banService: createAdminBanService(getLogStores(ViolationTypes.BAN), {
    useRedis: isEnabled(process.env.USE_REDIS),
  }),
  pauseService: getPauseService(),
  getUserById: db.getUserById,
  findBalanceByUser: db.findBalanceByUser,
  upsertBalanceFields: db.upsertBalanceFields,
  invalidateAuthUserCache: (userId) =>
    invalidateCachedAuthUserDoc(getLogStores(CacheKeys.AUTH_USER_DOC), { userId }),
  deleteUserSessions: (userId) => db.deleteAllUserSessions({ userId }),
  recordAuditEntry: db.recordAuditEntry,
  /** Opt-in: fail the control request if its audit entry can't be persisted. */
  auditFailClosed: isEnabled(process.env.AUDIT_LOG_FAIL_CLOSED),
  banEnforced,
  isBalanceEnabled: async (user) => {
    const appConfig = await getAppConfig({
      role: user.role,
      userId: user._id?.toString(),
      tenantId: user.tenantId,
    });
    return getBalanceConfig(appConfig)?.enabled === true;
  },
});

router.use(requireJwtAuth, requireAdminAccess, requireManageControls);

router.get('/pause', handlers.getPause);
router.put('/pause', handlers.setPause);
router.get('/users/:id', handlers.getUserControls);
router.post('/users/:id/ban', handlers.banUser);
router.delete('/users/:id/ban', handlers.unbanUser);
router.put('/users/:id/balance', handlers.setUserBalance);

module.exports = router;
