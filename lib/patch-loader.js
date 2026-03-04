/**
 * 补丁加载器 - 替换 validateToolArguments
 */

let patchApplied = false;
let originalValidate = null;

/**
 * 获取原始验证函数
 */
function getOriginalValidate() {
  if (originalValidate) {
    return originalValidate;
  }

  try {
    const piAi = require('@mariozechner/pi-ai');
    originalValidate = piAi.validateToolArguments;
    return originalValidate;
  } catch (err) {
    console.warn('[LLM-RETRY] Could not load @mariozechner/pi-ai, using default validator');
    // 返回默认实现（直接返回参数）
    return function defaultValidate(tool, toolCall) {
      return toolCall.arguments;
    };
  }
}

/**
 * 应用补丁
 */
function patch(validateWrapper) {
  if (patchApplied) {
    console.log('[LLM-RETRY] Patch already applied');
    return true;
  }

  try {
    const piAi = require('@mariozechner/pi-ai');

    // 保存原始函数
    if (!originalValidate) {
      originalValidate = piAi.validateToolArguments;
    }

    // 应用补丁
    piAi.validateToolArguments = function(tool, toolCall, ...args) {
      return validateWrapper(tool, toolCall, originalValidate, ...args);
    };

    patchApplied = true;
    console.log('[LLM-RETRY] ✓ Patch applied successfully to @mariozechner/pi-ai');
    return true;

  } catch (err) {
    console.error('[LLM-RETRY] ✗ Failed to apply patch:', err.message);
    return false;
  }
}

/**
 * 移除补丁（恢复原始函数）
 */
function unpatch() {
  if (!patchApplied) {
    return true;
  }

  try {
    const piAi = require('@mariozechner/pi-ai');

    if (originalValidate) {
      piAi.validateToolArguments = originalValidate;
    }

    patchApplied = false;
    console.log('[LLM-RETRY] ✓ Patch removed successfully');
    return true;

  } catch (err) {
    console.error('[LLM-RETRY] ✗ Failed to remove patch:', err.message);
    return false;
  }
}

/**
 * 检查补丁状态
 */
function isPatched() {
  return patchApplied;
}

module.exports = {
  patch,
  unpatch,
  getOriginalValidate,
  isPatched
};
