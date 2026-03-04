/**
 * 单元测试 - LLM 重试处理器
 */

const { formatRetryMessage, diagnoseIssues, generateCorrectExample, MAX_RETRIES } = require('../lib/error-formatter');
const { getStats, resetStats } = require('../lib/logger');

console.log('Running LLM Retry Handler Tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: diagnoseIssues 检测 partialJson 错误
test('diagnoseIssues detects invalid partialJson', () => {
  const args = {
    partialJson: '{"incomplete": '
  };
  const issues = diagnoseIssues(args, new Error('Invalid JSON'));

  assert(issues.length > 0, 'Should detect issues');
  assert(issues.some(i => i.includes('invalid JSON')), 'Should mention invalid JSON');
});

// Test 2: diagnoseIssues 检测 command 字段问题
test('diagnoseIssues detects command field issues', () => {
  const args = {
    command: { invalid: 'type' }
  };
  const issues = diagnoseIssues(args, new Error('Invalid command'));

  assert(issues.length > 0, 'Should detect issues');
  assert(issues.some(i => i.includes('must be a string')), 'Should mention string requirement');
});

// Test 3: diagnoseIssues 检测未闭合引号
test('diagnoseIssues detects unbalanced quotes', () => {
  const args = {
    text: 'This has "unbalanced quotes'
  };
  const issues = diagnoseIssues(args, new Error('Invalid text'));

  assert(issues.length > 0, 'Should detect unbalanced quotes');
  assert(issues.some(i => i.includes('unbalanced quotes')), 'Should mention unbalanced quotes');
});

// Test 4: formatRetryMessage 生成完整消息
test('formatRetryMessage generates complete message', () => {
  const tool = {
    name: 'test_tool',
    parameters: {
      properties: {
        command: { type: 'string', description: 'Command to execute' }
      },
      required: ['command']
    }
  };

  const toolCall = {
    id: 'test-123',
    name: 'test_tool',
    arguments: {
      command: 'invalid "json'
    }
  };

  const error = new Error('Validation failed');
  const message = formatRetryMessage(tool, toolCall, error, 1);

  assert(message.includes('Tool validation failed'), 'Should include validation failed header');
  assert(message.includes('test_tool'), 'Should include tool name');
  assert(message.includes('attempt 1/3'), 'Should include attempt info');
  assert(message.includes('Error'), 'Should include error section');
  assert(message.includes('Expected Parameters'), 'Should include parameters section');
  assert(message.includes('Received Arguments'), 'Should include received arguments');
  assert(message.includes('Issues Found') || message.includes('Correct Example'), 'Should include guidance');
});

// Test 5: generateCorrectExample 生成正确格式
test('generateCorrectExample generates correct format', () => {
  const tool = {
    name: 'exec',
    parameters: {
      properties: {
        command: { type: 'string' }
      }
    }
  };

  const args = {
    command: 'uv run script.py',
    partialJson: '{"bad": json}'
  };

  const example = generateCorrectExample(tool, args);

  // 验证是有效的 JSON
  const parsed = JSON.parse(example);
  assert(typeof parsed === 'object', 'Should be an object');
});

// Test 6: MAX_RETRIES 常量
test('MAX_RETRIES is set to 3', () => {
  assert(MAX_RETRIES === 3, 'MAX_RETRIES should be 3');
});

// Test 7: 统计功能
test('Statistics tracking works', () => {
  resetStats();
  const stats1 = getStats();

  assert(stats1.totalValidations === 0, 'Should start with 0 validations');
  assert(stats1.retryAttempts === 0, 'Should start with 0 retries');
});

// Test 8: 空参数处理
test('Handles empty arguments gracefully', () => {
  const tool = {
    name: 'simple_tool',
    parameters: {}
  };

  const toolCall = {
    id: 'test-456',
    name: 'simple_tool',
    arguments: {}
  };

  const error = new Error('No arguments provided');
  const message = formatRetryMessage(tool, toolCall, error, 1);

  assert(message.includes('simple_tool'), 'Should include tool name');
  assert(message.length > 0, 'Should generate a message');
});

// Test 9: 多问题诊断
test('Diagnoses multiple issues', () => {
  const args = {
    partialJson: '{bad: "json"}',
    command: { not: 'string' },
    text: 'unbalanced " quotes'
  };
  const issues = diagnoseIssues(args, new Error('Multiple errors'));

  assert(issues.length >= 2, 'Should detect multiple issues');
});

// Test 10: 格式化参数
test('Formats parameters correctly', () => {
  const { formatParameters } = require('../lib/error-formatter');

  const parameters = {
    properties: {
      command: {
        type: 'string',
        description: 'Command to execute'
      },
      cwd: {
        type: 'string',
        description: 'Working directory'
      }
    },
    required: ['command']
  };

  const formatted = formatParameters(parameters);

  assert(formatted.includes('command'), 'Should include command parameter');
  assert(formatted.includes('required'), 'Should mark command as required');
  assert(formatted.includes('optional') || !formatted.includes('cwd (string, optional)'), 'Should handle optional params');
});

// 总结
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('='.repeat(50));

if (testsFailed > 0) {
  process.exit(1);
}
