const express = require('express');
const { createAdminFlagsHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadConversations = requireCapability(SystemCapabilities.READ_CONVERSATIONS);

const handlers = createAdminFlagsHandlers({
  listFlags: db.listFlags,
  resolveFlag: db.resolveFlag,
  recordAuditEntry: db.recordAuditEntry,
  auditFailClosed: process.env.AUDIT_LOG_FAIL_CLOSED === 'true',
});

router.use(requireJwtAuth, requireAdminAccess, requireReadConversations);

router.get('/', handlers.listFlags);
router.post('/:id/resolve', handlers.resolveFlag);

module.exports = router;
