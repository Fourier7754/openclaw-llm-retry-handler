/**
 * OpenClaw LLM Retry Handler - 使用示例
 *
 * 这个示例展示了如何在 OpenClaw 项目中配置和使用重试处理器
 */

// ============================================================
// 方式 1: 基础配置 - 在 agent 入口文件中
// ============================================================

// 在你的 OpenClaw agent 入口文件 (如 index.js 或 main.js) 中添加:
const retryHandler = require('./index');

// 启用两层防护
retryHandler.patch({
  enableLayer1: true,  // Layer 1: JSON 解析错误检测
  enableLayer2: true,  // Layer 2: 验证和重试
  strict: true         // 严格模式（推荐）
});

console.log('[LLM-RETRY] Two-layer protection enabled');

// ============================================================
// 方式 2: 在 QQ Bot 扩展配置中
// ============================================================

// 文件: /path/to/home/.openclaw/extensions/qqbot/config.js
/*
const retryHandler = require('openclaw-llm-retry-handler');

// 启用保护
retryHandler.patch({
  enableLayer1: true,
  enableLayer2: true,
  strict: true
});

// 其他配置...
module.exports = {
  // ... 你的配置
};
*/

// ============================================================
// 方式 3: 使用预处理器
// ============================================================

// 创建预处理器并注入到 agent 配置
const preprocessor = retryHandler.createPreprocessor({
  maxRetries: 3,
  enable: true
});

// 在 agent 配置中使用
/*
const agentConfig = {
  preprocessors: [preprocessor],
  // ... 其他配置
};
*/

// ============================================================
// 监控和统计
// ============================================================

// 定期检查统计信息
setInterval(() => {
  const stats = retryHandler.getStats();
  if (stats.totalValidations > 0) {
    console.log('[LLM-RETRY] Status:', {
      validations: stats.totalValidations,
      failures: stats.validationFailures,
      retrySuccess: stats.successfulRetries,
      successRate: stats.successRate
    });
  }
}, 60000); // 每分钟检查一次

// 或者手动打印统计信息
// retryHandler.printStats();

// ============================================================
// 高级配置
// ============================================================

// 自定义配置
retryHandler.configure({
  maxRetries: 5,              // 增加重试次数
  enablePreprocessor: true,   // 启用预处理器
  autoPatch: false,           // 不自动打补丁（手动控制）
  enableLayer1: true,
  enableLayer2: true
});

// 获取当前配置
const config = retryHandler.getConfig();
console.log('[LLM-RETRY] Current config:', config);

// 获取完整状态
const status = retryHandler.getStatus();
console.log('[LLM-RETRY] Full status:', JSON.stringify(status, null, 2));

// ============================================================
// 运行时控制
// ============================================================

// 如果需要临时禁用
/*
retryHandler.unpatch();
console.log('[LLM-RETRY] Protection disabled');

// 重新启用
retryHandler.patch();
console.log('[LLM-RETRY] Protection re-enabled');
*/

// ============================================================
// 测试功能
// ============================================================

// 模拟一个格式错误的 JSON 进行测试
function testMalformedJson() {
  const { formatRetryMessage } = require('./lib/error-formatter');

  const tool = {
    name: 'exec',
    parameters: {
      properties: {
        command: { type: 'string', description: 'Command to execute' }
      },
      required: ['command']
    }
  };

  const toolCall = {
    id: 'test-123',
    name: 'exec',
    arguments: {
      partialJson: '{"command": uv run script.py}'  // 缺少引号
    }
  };

  const error = new Error('Unexpected token u in JSON');
  const message = formatRetryMessage(tool, toolCall, error, 1);

  console.log('\n=== Test: Malformed JSON Handling ===');
  console.log(message);
  console.log('=== End Test ===\n');
}

// 取消注释以运行测试
// testMalformedJson();

// ============================================================
// 导出配置供其他模块使用
// ============================================================

module.exports = {
  retryHandler,
  preprocessor,
  getConfig: () => retryHandler.getConfig(),
  getStats: () => retryHandler.getStats()
};
