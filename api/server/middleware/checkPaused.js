const { logger, SystemCapabilities } = require('@librechat/data-schemas');
const { PAUSED_STATUS, toPausedError, getPauseService } = require('@librechat/api');
const { hasCapability } = require('~/server/middleware/roles/capabilities');

/** Admins who can flip the switch may still chat, so they can verify a pause end to end. */
async function canBypassPause(user) {
  const id = user?.id ?? user?._id?.toString();
  if (!user || !id) {
    return false;
  }
  try {
    return await hasCapability(
      {
        id,
        role: user.role ?? '',
        tenantId: user.tenantId,
        idOnTheSource: user.idOnTheSource ?? null,
      },
      SystemCapabilities.MANAGE_CONTROLS,
    );
  } catch (error) {
    logger.error('[checkPaused] Failed to check manage:controls; treating as paused:', error);
    return false;
  }
}

/**
 * Rejects run-starting requests while the global pause switch
 * (`PUT /api/admin/controls/pause`) is on. Fails open if the pause store is unreachable.
 */
const checkPaused = async (req, res, next) => {
  try {
    const state = await getPauseService().getState();
    if (!state.paused || (await canBypassPause(req.user))) {
      return next();
    }
    return res.status(PAUSED_STATUS).json(toPausedError(state));
  } catch (error) {
    logger.error('[checkPaused] Failed to read pause state:', error);
    return next();
  }
};

module.exports = checkPaused;
