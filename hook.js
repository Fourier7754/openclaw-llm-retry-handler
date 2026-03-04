/**
 * LLM Retry Handler Hook for OpenClaw
 *
 * This hook applies the LLM retry handler patches at startup
 */

const path = require('path');

const DEFAULT_CONFIG = {
  enabled: true,
  enableLayer1: true,
  enableLayer2: true,
  strict: true,
  logStats: false
};

let retryHandler = null;
let isPatched = false;

function llmRetryHook(event, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Only patch once on first call
  if (!isPatched && finalConfig.enabled) {
    try {
      // Import the retry handler
      if (!retryHandler) {
        retryHandler = require('./index.js');
      }

      // Apply patches
      const result = retryHandler.patch({
        enableLayer1: finalConfig.enableLayer1,
        enableLayer2: finalConfig.enableLayer2,
        strict: finalConfig.strict
      });

      isPatched = result.both || result.layer1 || result.layer2;

      if (isPatched) {
        console.log('[llm-retry-hook] ✓ LLM retry handler patches applied successfully');
        if (finalConfig.logStats) {
          // Log stats every 5 minutes
          setInterval(() => {
            const stats = retryHandler.getStats();
            console.log('[llm-retry-hook] Stats:', stats);
          }, 300000);
        }
      } else {
        console.log('[llm-retry-hook] ⚠ Failed to apply some patches');
      }
    } catch (error) {
      console.error('[llm-retry-hook] ✗ Failed to apply patches:', error.message);
    }
  }

  // Return event unchanged (this hook doesn't modify events)
  return event;
}

module.exports = llmRetryHook;
