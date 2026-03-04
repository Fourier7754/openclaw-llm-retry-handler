/**
 * 重试日志和统计
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 统计数据
const stats = {
  totalValidations: 0,
  validationFailures: 0,
  retryAttempts: 0,
  successfulRetries: 0,
  failedRetries: 0,
  byTool: new Map()
};

// 日志文件路径（使用动态 home 目录）
const logPath = path.join(os.homedir(), '.openclaw/logs/llm-retries.log');

/**
 * 记录重试尝试
 */
function logRetryAttempt(toolName, toolCall, error, attempt) {
  stats.totalValidations++;
  stats.validationFailures++;
  stats.retryAttempts++;

  // 按工具统计
  if (!stats.byTool.has(toolName)) {
    stats.byTool.set(toolName, {
      attempts: 0,
      successes: 0,
      failures: 0
    });
  }
  const toolStats = stats.byTool.get(toolName);
  toolStats.attempts++;

  // 写入日志文件
  const logEntry = {
    timestamp: new Date().toISOString(),
    toolName,
    attempt,
    error: error.message,
    toolCall: {
      name: toolCall.name,
      arguments: toolCall.arguments
    }
  };

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.error('[LLM-RETRY] Failed to write log:', err.message);
  }
}

/**
 * 记录重试成功
 */
function logRetrySuccess(toolName) {
  stats.successfulRetries++;

  const toolStats = stats.byTool.get(toolName);
  if (toolStats) {
    toolStats.successes++;
  }
}

/**
 * 记录重试失败
 */
function logRetryFailure(toolName) {
  stats.failedRetries++;

  const toolStats = stats.byTool.get(toolName);
  if (toolStats) {
    toolStats.failures++;
  }
}

/**
 * 获取统计信息
 */
function getStats() {
  return {
    totalValidations: stats.totalValidations,
    validationFailures: stats.validationFailures,
    retryAttempts: stats.retryAttempts,
    successfulRetries: stats.successfulRetries,
    failedRetries: stats.failedRetries,
    successRate: stats.retryAttempts > 0
      ? ((stats.successfulRetries / stats.retryAttempts) * 100).toFixed(2) + '%'
      : 'N/A',
    byTool: Object.fromEntries(stats.byTool)
  };
}

/**
 * 重置统计
 */
function resetStats() {
  stats.totalValidations = 0;
  stats.validationFailures = 0;
  stats.retryAttempts = 0;
  stats.successfulRetries = 0;
  stats.failedRetries = 0;
  stats.byTool.clear();
}

/**
 * 打印统计信息到控制台
 */
function printStats() {
  const s = getStats();
  console.log('[LLM-RETRY] Statistics:');
  console.log(`  Total validations: ${s.totalValidations}`);
  console.log(`  Validation failures: ${s.validationFailures}`);
  console.log(`  Retry attempts: ${s.retryAttempts}`);
  console.log(`  Successful retries: ${s.successfulRetries}`);
  console.log(`  Failed retries: ${s.failedRetries}`);
  console.log(`  Success rate: ${s.successRate}`);

  if (Object.keys(s.byTool).length > 0) {
    console.log('\n[LLM-RETRY] By tool:');
    for (const [tool, toolStats] of Object.entries(s.byTool)) {
      console.log(`  ${tool}: ${toolStats.attempts} attempts, ${toolStats.successes} successes, ${toolStats.failures} failures`);
    }
  }
}

module.exports = {
  logRetryAttempt,
  logRetrySuccess,
  logRetryFailure,
  getStats,
  resetStats,
  printStats
};
