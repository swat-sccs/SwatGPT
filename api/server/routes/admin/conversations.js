const express = require('express');
const { createAdminConversationsHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadConversations = requireCapability(SystemCapabilities.READ_CONVERSATIONS);
const requireExportConversations = requireCapability(SystemCapabilities.EXPORT_CONVERSATIONS);

const handlers = createAdminConversationsHandlers({
  listConversationsAdmin: db.listConversationsAdmin,
  getConversationAdmin: db.getConversationAdmin,
  findConversationOwner: db.findConversationOwner,
  searchMessagesAdmin: db.searchMessagesAdmin,
  searchMessageTextAdmin: db.searchMessageTextAdmin,
  createFlagAdmin: db.createFlagAdmin,
  deleteFlag: db.deleteFlag,
  recordAuditEntry: db.recordAuditEntry,
  /** Opt-in: refuse to disclose a conversation if its audit entry can't be persisted. */
  auditFailClosed: process.env.AUDIT_LOG_FAIL_CLOSED === 'true',
});

router.use(requireJwtAuth, requireAdminAccess, requireReadConversations);

router.get('/', handlers.listConversations);
router.get('/:conversationId', handlers.getConversation);
router.get('/:conversationId/export', requireExportConversations, handlers.exportConversation);
router.post('/:conversationId/flag', handlers.flagConversation);

module.exports = router;
