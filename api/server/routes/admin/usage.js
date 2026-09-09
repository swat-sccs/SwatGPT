const express = require('express');
const { ViolationTypes } = require('librechat-data-provider');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  createBanService,
  USAGE_USER_FIELDS,
  createUsageFlagReaders,
  createAdminUsageHandlers,
  createUsageConversationReaders,
} = require('@librechat/api');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const { Conversation, Message, Flag } = require('~/db/models');
const getLogStores = require('~/cache/getLogStores');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadUsage = requireCapability(SystemCapabilities.READ_USAGE);

const banService = createBanService(getLogStores(ViolationTypes.BAN));

const handlers = createAdminUsageHandlers({
  getUsageSummary: db.getUsageSummary,
  getUsageTimeseries: db.getUsageTimeseries,
  getUsageByUser: db.getUsageByUser,
  getUsageByModel: db.getUsageByModel,
  getConversationUsage: db.getConversationUsage,
  findUser: (userId) => db.findUser({ _id: userId }, USAGE_USER_FIELDS),
  ...createUsageConversationReaders({ Conversation, Message }),
  ...createUsageFlagReaders(Flag),
  isUserBanned: banService.isBanned,
});

router.use(requireJwtAuth, requireAdminAccess, requireReadUsage);

router.get('/summary', handlers.summary);
router.get('/timeseries', handlers.timeseries);
router.get('/users', handlers.users);
router.get('/users/:id', handlers.user);
router.get('/models', handlers.models);

module.exports = router;
