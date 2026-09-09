const { CacheKeys } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { createPauseService } = require('@librechat/api');
const { getLogStores } = require('~/cache');

let pauseService;

const getPauseService = () => {
  pauseService ??= createPauseService(getLogStores(CacheKeys.CONFIG_STORE));
  return pauseService;
};

/**
 * Rejects run-starting requests with 503 while the global pause switch
 * (`PUT /api/admin/controls/pause`) is on. Fails open if the cache is unreachable.
 */
const checkPaused = async (req, res, next) => {
  try {
    const state = await getPauseService().getState();
    if (!state.paused) {
      return next();
    }
    return res.status(503).json({ error: 'paused', message: state.message });
  } catch (error) {
    logger.error('[checkPaused] Failed to read pause state:', error);
    return next();
  }
};

module.exports = checkPaused;
