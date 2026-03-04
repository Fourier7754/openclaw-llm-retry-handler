/**
 * @openclaw/llm-retry-handler
 *
 * LLM-based JSON validation retry handler for OpenClaw
 *
 * 两层防护方案：
 * - Layer 1: LLM 响应解析层 - 捕获 JSON 解析错误并设置标记
 * - Layer 2: JSON 验证层 - 检测标记或验证 Schema 并生成重试指导
 *
 * Usage:
 *   const retryHandler = require('@openclaw/llm-retry-handler');
 *
 *   // 方式1: 自动应用补丁（启用两层防护）
 *   retryHandler.patch();
 *
 *   // 方式2: 配置选项
 *   retryHandler.patch({ enableLayer1: true, enableLayer2: true });
 *
 *   // 方式3: 获取预处理器配置
 *   const preprocessor = retryHandler.createPreprocessor({ maxRetries: 3 });
 *
 *   // 方式4: 获取统计信息
 *   console.log(retryHandler.getStats());
 */

const patchLoader = require('./lib/patch-loader');
const preprocessor = require('./lib/preprocessor');
const logger = require('./lib/logger');
const retryHandler = require('./lib/retry-handler');
const jsonParseEnhancer = require('./lib/json-parse-enhancer');

// 全局配置
const config = {
  maxRetries: 3,
  enablePreprocessor: true,
  autoPatch: false,
  enableLayer1: true,
  enableLayer2: true
};

// 补丁状态
const patchState = {
  layer1Applied: false,
  layer2Applied: false
};

/**
 * 应用补丁到 @mariozechner/pi-ai
 *
 * 这会应用两层防护：
 * - Layer 1: 增强 parseStreamingJson 函数以检测解析错误
 * - Layer 2: 替换 validateToolArguments 函数，添加重试逻辑
 *
 * @param {Object} options - 配置选项
 * @param {boolean} options.enableLayer1 - 是否启用 Layer 1（默认 true）
 * @param {boolean} options.enableLayer2 - 是否启用 Layer 2（默认 true）
 * @param {boolean} options.strict - Layer 1 严格模式（默认 true）
 * @returns {Object} 补丁状态
 */
function patch(options = {}) {
  const {
    enableLayer1 = config.enableLayer1,
    enableLayer2 = config.enableLayer2,
    strict = true
  } = options;

  const result = {
    layer1: false,
    layer2: false,
    both: false
  };

  // Layer 1: JSON 解析增强
  if (enableLayer1) {
    result.layer1 = jsonParseEnhancer.patchParseStreamingJson({ strict });
    patchState.layer1Applied = result.layer1;
    console.log(`[LLM-RETRY] Layer 1: ${result.layer1 ? '✓ Applied' : '✗ Failed'}`);
  }

  // Layer 2: 验证重试处理
  if (enableLayer2) {
    result.layer2 = patchLoader.patch((tool, toolCall, originalValidate) => {
      return retryHandler.validateToolArgumentsWithRetry(tool, toolCall, originalValidate);
    });
    patchState.layer2Applied = result.layer2;
    console.log(`[LLM-RETRY] Layer 2: ${result.layer2 ? '✓ Applied' : '✗ Failed'}`);
  }

  result.both = result.layer1 && result.layer2;

  if (result.both) {
    console.log('[LLM-RETRY] ✓ Two-layer protection fully enabled');
  } else if (result.layer1 || result.layer2) {
    console.log('[LLM-RETRY] ⚠ Partial protection enabled');
  } else {
    console.log('[LLM-RETRY] ✗ Failed to apply any patches');
  }

  return result;
}

/**
 * 移除补丁
 *
 * @returns {Object} 移除状态
 */
function unpatch() {
  const result = {
    layer1: false,
    layer2: false
  };

  if (patchState.layer1Applied) {
    result.layer1 = jsonParseEnhancer.unpatchParseStreamingJson();
    patchState.layer1Applied = false;
  }

  if (patchState.layer2Applied) {
    result.layer2 = patchLoader.unpatch();
    patchState.layer2Applied = false;
  }

  console.log(`[LLM-RETRY] Unpatch - Layer 1: ${result.layer1 ? '✓' : '✗'}, Layer 2: ${result.layer2 ? '✓' : '✗'}`);

  return result;
}

/**
 * 创建预处理器
 *
 * 用于在 OpenClaw agent 配置中注入重试指导
 *
 * @param {Object} options - 配置选项
 * @returns {Function} 预处理函数
 */
function createPreprocessor(options = {}) {
  return preprocessor.createRetryPreprocessor({
    maxRetries: config.maxRetries,
    enable: config.enablePreprocessor,
    ...options
  });
}

/**
 * 获取统计信息
 *
 * @returns {Object} 统计数据
 */
function getStats() {
  return {
    ...logger.getStats(),
    patchState: {
      layer1: patchState.layer1Applied,
      layer2: patchState.layer2Applied
    }
  };
}

/**
 * 打印统计信息到控制台
 */
function printStats() {
  const stats = getStats();
  console.log('[LLM-RETRY] Statistics:');
  console.log(`  Total validations: ${stats.totalValidations}`);
  console.log(`  Validation failures: ${stats.validationFailures}`);
  console.log(`  Retry attempts: ${stats.retryAttempts}`);
  console.log(`  Successful retries: ${stats.successfulRetries}`);
  console.log(`  Failed retries: ${stats.failedRetries}`);
  console.log(`  Success rate: ${stats.successRate}`);
  console.log(`  Layer 1 active: ${stats.patchState.layer1 ? 'Yes' : 'No'}`);
  console.log(`  Layer 2 active: ${stats.patchState.layer2 ? 'Yes' : 'No'}`);

  if (Object.keys(stats.byTool).length > 0) {
    console.log('\n[LLM-RETRY] By tool:');
    for (const [tool, toolStats] of Object.entries(stats.byTool)) {
      console.log(`  ${tool}: ${toolStats.attempts} attempts, ${toolStats.successes} successes, ${toolStats.failures} failures`);
    }
  }
}

/**
 * 重置统计信息
 */
function resetStats() {
  logger.resetStats();
}

/**
 * 配置选项
 *
 * @param {Object} options - 新的配置选项
 */
function configure(options) {
  Object.assign(config, options);

  if (options.autoPatch) {
    patch();
  }

  return config;
}

/**
 * 获取当前配置
 *
 * @returns {Object} 当前配置
 */
function getConfig() {
  return { ...config };
}

/**
 * 获取重试状态
 *
 * @returns {Object} 重试状态
 */
function getStatus() {
  return {
    patched: {
      layer1: patchState.layer1Applied,
      layer2: patchState.layer2Applied,
      any: patchState.layer1Applied || patchState.layer2Applied
    },
    retryStatus: retryHandler.getRetryStatus(),
    config: getConfig()
  };
}

// 导出公共 API
module.exports = {
  // 核心功能
  patch,
  unpatch,
  createPreprocessor,

  // 统计和状态
  getStats,
  printStats,
  resetStats,
  getStatus,

  // 配置
  configure,
  getConfig,

  // 常量
  MAX_RETRIES: retryHandler.MAX_RETRIES,
  VERSION: '2.0.0-two-layer',

  // 子模块（高级用法）
  _patchLoader: patchLoader,
  _preprocessor: preprocessor,
  _logger: logger,
  _retryHandler: retryHandler,
  _jsonParseEnhancer: jsonParseEnhancer
};
