/**
 * LLM 重试处理器
 *
 * 当工具验证失败时，构造清晰的重试指导消息
 *
 * 支持两层防护：
 * - Layer 1: 检测 LLM 响应解析错误（__parseError 标记）
 * - Layer 2: 检测 JSON Schema 验证错误
 */

const { formatRetryMessage, formatParseErrorMessage, MAX_RETRIES } = require('./error-formatter');
const { logRetryAttempt, logRetrySuccess, logRetryFailure } = require('./logger');

// 工具调用重试计数 (toolCallId -> retryCount)
const retryCounters = new Map();

/**
 * 检测 Layer 1 的解析错误标记
 *
 * 检查 toolCall 中是否包含 Layer 1 设置的解析错误标记
 *
 * @param {Object} toolCall - 工具调用对象
 * @returns {Object|null} 错误信息对象或 null
 */
function detectLayer1ParseError(toolCall) {
  // 检查 arguments 中的 __parseError 标记
  if (toolCall.arguments?.__parseError) {
    return {
      type: 'layer1',
      rawJson: toolCall.arguments.__rawJson || toolCall.partialJson || '',
      diagnosis: toolCall.arguments.__diagnosis || 'Unknown parsing error',
      originalError: toolCall.arguments.__originalError
    };
  }

  // 检查 toolCall 级别的 parseError 标记
  if (toolCall.parseError) {
    return {
      type: 'layer1',
      rawJson: toolCall.partialJson || JSON.stringify(toolCall.arguments || {}),
      diagnosis: 'Parse error detected by streaming parser',
      originalError: toolCall.errorMessage
    };
  }

  return null;
}

/**
 * 带重试的工具参数验证
 *
 * 这个函数会替换 @mariozechner/pi-ai 的 validateToolArguments
 *
 * @param {Object} tool - 工具定义
 * @param {Object} toolCall - 工具调用
 * @param {Function} originalValidate - 原始验证函数
 * @returns {Object} 验证后的参数
 * @throws {Error} 验证错误或重试次数超限
 */
function validateToolArgumentsWithRetry(tool, toolCall, originalValidate) {
  const toolCallId = toolCall.id || `tool-${Date.now()}-${Math.random()}`;
  const currentRetries = retryCounters.get(toolCallId) || 0;

  // ===== Layer 1: 检测解析错误标记 =====
  const parseError = detectLayer1ParseError(toolCall);

  if (parseError) {
    // Layer 1 检测到解析错误
    return handleParseError(tool, toolCall, parseError, toolCallId, currentRetries);
  }

  // ===== Layer 2: 正常验证流程 =====
  try {
    // 尝试原始验证
    let result;
    if (originalValidate && typeof originalValidate === 'function') {
      result = originalValidate(tool, toolCall);
    } else {
      // 默认验证：检查是否有 arguments
      if (!toolCall.arguments) {
        throw new Error('Missing arguments in tool call');
      }
      result = toolCall.arguments;
    }

    // 验证成功，清除计数器
    if (currentRetries > 0) {
      logRetrySuccess(tool.name);
      console.log(`[LLM-RETRY-L2] ✓ Validation succeeded for "${tool.name}" after ${currentRetries} retries`);
    }
    retryCounters.delete(toolCallId);

    return result;

  } catch (err) {
    // 验证失败（Layer 2）
    return handleValidationError(tool, toolCall, err, toolCallId, currentRetries);
  }
}

/**
 * 处理 Layer 1 解析错误
 *
 * @param {Object} tool - 工具定义
 * @param {Object} toolCall - 工具调用
 * @param {Object} parseError - 解析错误信息
 * @param {string} toolCallId - 工具调用 ID
 * @param {number} currentRetries - 当前重试次数
 * @throws {Error} 重试错误或达到最大重试次数
 */
function handleParseError(tool, toolCall, parseError, toolCallId, currentRetries) {
  const error = new Error(`LLM response parsing failed: ${parseError.rawJson.substring(0, 100)}...`);
  error.name = 'ParseError';

  logRetryAttempt(tool.name, toolCall, error, currentRetries);

  // 超过重试次数，直接抛出错误
  if (currentRetries >= MAX_RETRIES) {
    retryCounters.delete(toolCallId);
    logRetryFailure(tool.name);
    const finalError = new Error(`Max retries (${MAX_RETRIES}) exceeded for tool "${tool.name}": Parse error`);
    finalError.name = 'MaxRetriesExceededError';
    finalError.toolName = tool.name;
    finalError.layer = 'layer1';
    throw finalError;
  }

  // 增加重试计数
  retryCounters.set(toolCallId, currentRetries + 1);

  console.log(`[LLM-RETRY-L1] Parse error detected for "${tool.name}" (attempt ${currentRetries + 1}/${MAX_RETRIES})`);
  console.log(`[LLM-RETRY-L1]   Diagnosis: ${parseError.diagnosis}`);

  // 构造 Layer 1 专用的重试指导消息
  const retryMessage = formatParseErrorMessage(tool, toolCall, parseError.rawJson, currentRetries + 1, parseError.diagnosis);

  // 抛出包含重试指导的错误
  const retryError = new Error(retryMessage);
  retryError.name = 'ToolParseError';
  retryError.isRetryable = true;
  retryError.retryAttempt = currentRetries + 1;
  retryError.toolName = tool.name;
  retryError.layer = 'layer1';
  retryError.diagnosis = parseError.diagnosis;

  throw retryError;
}

/**
 * 处理 Layer 2 验证错误
 *
 * @param {Object} tool - 工具定义
 * @param {Object} toolCall - 工具调用
 * @param {Error} err - 原始错误
 * @param {string} toolCallId - 工具调用 ID
 * @param {number} currentRetries - 当前重试次数
 * @throws {Error} 重试错误或达到最大重试次数
 */
function handleValidationError(tool, toolCall, err, toolCallId, currentRetries) {
  // 验证失败
  logRetryAttempt(tool.name, toolCall, err, currentRetries);

  // 超过重试次数，直接抛出错误
  if (currentRetries >= MAX_RETRIES) {
    retryCounters.delete(toolCallId);
    logRetryFailure(tool.name);
    const finalError = new Error(`Max retries (${MAX_RETRIES}) exceeded for tool "${tool.name}": ${err.message}`);
    finalError.name = 'MaxRetriesExceededError';
    finalError.toolName = tool.name;
    finalError.layer = 'layer2';
    finalError.originalError = err;
    throw finalError;
  }

  // 增加重试计数
  retryCounters.set(toolCallId, currentRetries + 1);

  console.log(`[LLM-RETRY-L2] Validation failed for "${tool.name}" (attempt ${currentRetries + 1}/${MAX_RETRIES}): ${err.message}`);

  // 构造重试指导消息
  const retryMessage = formatRetryMessage(tool, toolCall, err, currentRetries + 1);

  // 抛出包含重试指导的错误
  const retryError = new Error(retryMessage);
  retryError.name = 'ToolValidationError';
  retryError.isRetryable = true;
  retryError.retryAttempt = currentRetries + 1;
  retryError.toolName = tool.name;
  retryError.layer = 'layer2';
  retryError.originalError = err;

  throw retryError;
}

/**
 * 清理过期的重试计数器（防止内存泄漏）
 */
function cleanupOldCounters(maxAge = 300000) { // 默认5分钟
  const now = Date.now();
  const toDelete = [];

  for (const [id, data] of retryCounters.entries()) {
    if (data.timestamp && (now - data.timestamp) > maxAge) {
      toDelete.push(id);
    }
  }

  toDelete.forEach(id => retryCounters.delete(id));

  if (toDelete.length > 0) {
    console.log(`[LLM-RETRY] Cleaned up ${toDelete.length} old retry counters`);
  }
}

// 定期清理（每分钟）
if (typeof setInterval !== 'undefined') {
  setInterval(() => cleanupOldCounters(), 60000);
}

/**
 * 获取当前重试状态
 */
function getRetryStatus() {
  return {
    activeRetries: retryCounters.size,
    maxRetries: MAX_RETRIES,
    counters: Object.fromEntries(retryCounters)
  };
}

module.exports = {
  validateToolArgumentsWithRetry,
  cleanupOldCounters,
  getRetryStatus,
  MAX_RETRIES
};
