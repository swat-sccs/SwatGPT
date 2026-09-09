const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

/** Owned by the controls work (Layer E): wire `createAdminControlsHandlers` from `@librechat/api` here. */
router.use(requireJwtAuth, requireAdminAccess);

module.exports = router;
