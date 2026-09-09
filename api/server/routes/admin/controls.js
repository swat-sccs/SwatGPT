const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { CacheKeys, ViolationTypes } = require('librechat-data-provider');
const {
  isEnabled,
  keyvMongo,
  createBanService,
  createPauseService,
  invalidateCachedAuthUserDoc,
  createAdminControlsHandlers,
} = require('@librechat/api');
const { Keyv } = require('keyv');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const { getLogStores } = require('~/cache');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireManageControls = requireCapability(SystemCapabilities.MANAGE_CONTROLS);

/** Same store and namespace as the fast-path `banCache` inside `checkBan`. */
const banEnforcementCache = new Keyv({ store: keyvMongo, namespace: ViolationTypes.BAN, ttl: 0 });

const handlers = createAdminControlsHandlers({
  banService: createBanService(getLogStores(ViolationTypes.BAN), {
    enforcementCache: banEnforcementCache,
    useRedis: isEnabled(process.env.USE_REDIS),
  }),
  pauseService: createPauseService(getLogStores(CacheKeys.CONFIG_STORE)),
  getUserById: db.getUserById,
  findBalanceByUser: db.findBalanceByUser,
  upsertBalanceFields: db.upsertBalanceFields,
  invalidateAuthUserCache: (userId) =>
    invalidateCachedAuthUserDoc(getLogStores(CacheKeys.AUTH_USER_DOC), { userId }),
  deleteUserSessions: (userId) => db.deleteAllUserSessions({ userId }),
  recordAuditEntry: db.recordAuditEntry,
  /** Opt-in: fail the control request if its audit entry can't be persisted. */
  auditFailClosed: process.env.AUDIT_LOG_FAIL_CLOSED === 'true',
});

router.use(requireJwtAuth, requireAdminAccess, requireManageControls);

router.get('/pause', handlers.getPause);
router.put('/pause', handlers.setPause);
router.get('/users/:id', handlers.getUserControls);
router.post('/users/:id/ban', handlers.banUser);
router.delete('/users/:id/ban', handlers.unbanUser);
router.put('/users/:id/balance', handlers.setUserBalance);

module.exports = router;
