const { logger } = require('@librechat/data-schemas');
const { PAUSED_STATUS, toPausedError, getPauseService } = require('@librechat/api');

/**
 * Rejects run-starting requests while the global pause switch
 * (`PUT /api/admin/controls/pause`) is on. Fails open if the pause store is unreachable.
 */
const checkPaused = async (req, res, next) => {
  try {
    const state = await getPauseService().getState();
    if (!state.paused) {
      return next();
    }
    return res.status(PAUSED_STATUS).json(toPausedError(state));
  } catch (error) {
    logger.error('[checkPaused] Failed to read pause state:', error);
    return next();
  }
};

module.exports = checkPaused;
