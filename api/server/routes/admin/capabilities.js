const express = require('express');
const { createAdminCapabilitiesHandlers } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const { getUserPrincipals, getHeldCapabilities } = require('~/models');

const router = express.Router();

const handlers = createAdminCapabilitiesHandlers({ getUserPrincipals, getHeldCapabilities });

router.get('/', requireJwtAuth, handlers.getCapabilities);

module.exports = router;
