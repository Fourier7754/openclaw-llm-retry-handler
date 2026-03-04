/**
 * 格式化重试指导消息
 *
 * 目标：让 LLM 理解错误并知道如何修正
 *
 * 支持两种错误类型：
 * - Layer 1: JSON 解析错误（格式错误的 JSON）
 * - Layer 2: JSON Schema 验证错误（有效 JSON 但不符合 schema）
 */

const MAX_RETRIES = 3;

/**
 * 格式化重试消息（Layer 2 - Schema 验证错误）
 */
function formatRetryMessage(tool, toolCall, error, retryAttempt) {
  const { name, parameters } = tool;
  const args = toolCall.arguments || {};

  // 构造清晰的重试指导
  let message = `Tool validation failed for "${name}" (attempt ${retryAttempt}/${MAX_RETRIES}):\n\n`;

  // 错误详情
  message += `**Error**: ${error.message}\n\n`;

  // 参数要求
  message += `**Expected Parameters**:\n`;
  message += formatParameters(parameters);

  // 实际接收的参数
  message += `\n**Received Arguments**:\n`;
  message += '```json\n';
  message += JSON.stringify(args, null, 2);
  message += '\n```\n\n';

  // 具体问题诊断
  const issues = diagnoseIssues(args, error);
  if (issues.length > 0) {
    message += `**Issues Found**:\n`;
    issues.forEach((issue, i) => {
      message += `${i + 1}. ${issue}\n`;
    });
    message += '\n';
  }

  // 正确格式示例
  message += `**Correct Example**:\n`;
  message += '```json\n';
  message += generateCorrectExample(tool, args);
  message += '\n```\n\n';

  // 重试要求
  message += `**Action Required**: Please regenerate the tool call with correctly formatted JSON.`;
  message += ` Ensure all string values are quoted, all keys are quoted, and the JSON is valid.`;

  return message;
}

/**
 * 格式化参数要求
 */
function formatParameters(parameters) {
  let result = '';

  if (parameters?.properties) {
    for (const [name, schema] of Object.entries(parameters.properties)) {
      const required = parameters.required?.includes(name) ? 'required' : 'optional';
      result += `- ${name} (${schema.type}, ${required})\n`;
      if (schema.description) {
        result += `  ${schema.description}\n`;
      }
    }
  }

  return result || 'No parameters defined\n';
}

/**
 * 诊断参数问题
 */
function diagnoseIssues(args, error) {
  const issues = [];

  // 检查 partialJson 字段
  if (args.partialJson) {
    try {
      JSON.parse(args.partialJson);
    } catch (e) {
      issues.push(`The "partialJson" field contains invalid JSON: ${e.message}`);
      issues.push(`Common fix: Ensure all keys and string values are quoted`);
    }
  }

  // 检查 command 字段格式
  if (args.command) {
    if (typeof args.command !== 'string') {
      issues.push(`The "command" field must be a string, got ${typeof args.command}`);
    } else if (args.command.includes('partialJson')) {
      issues.push(`The "command" field appears to contain JSON metadata instead of actual command`);
    }
  }

  // 检查 JSON 字符串中的未闭合引号
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      // 检查是否有未闭合的引号
      const quotes = (value.match(/"/g) || []).length;
      if (quotes % 2 !== 0 && !value.includes('\\"')) {
        issues.push(`Field "${key}" has unbalanced quotes (count: ${quotes})`);
      }
    }
  }

  return issues;
}

/**
 * 生成正确的格式示例
 */
function generateCorrectExample(tool, args) {
  const corrected = {};

  for (const [key, value] of Object.entries(args)) {
    if (key === 'command' && typeof value === 'string') {
      // 保留 command 字段（如果是简单字符串）
      corrected[key] = value.includes('"') ? 'uv run script.py' : value;
    } else if (key === 'partialJson') {
      // 提供正确的 partialJson 示例
      corrected[key] = '{"key": "value"}';
    } else if (typeof value === 'object') {
      corrected[key] = value;
    } else {
      corrected[key] = value;
    }
  }

  return JSON.stringify(corrected, null, 2);
}

/**
 * 格式化解析错误消息（Layer 1 - JSON 解析错误）
 *
 * @param {Object} tool - 工具定义
 * @param {Object} toolCall - 工具调用
 * @param {string} rawJson - 无法解析的原始 JSON 字符串
 * @param {number} retryAttempt - 当前重试次数
 * @param {string} diagnosis - 诊断信息
 * @returns {string} 格式化的重试消息
 */
function formatParseErrorMessage(tool, toolCall, rawJson, retryAttempt, diagnosis) {
  const { name, parameters } = tool;

  let message = `LLM response parsing failed for "${name}" (attempt ${retryAttempt}/${MAX_RETRIES}):\n\n`;

  message += `**Error**: The LLM generated invalid JSON that could not be parsed.\n\n`;

  // 显示接收到的无效 JSON
  message += `**Invalid JSON Received**:\n`;
  message += '```\n';
  message += rawJson.substring(0, 500);
  if (rawJson.length > 500) message += '...';
  message += '\n```\n\n';

  // 尝试诊断问题
  const issues = diagnoseParseIssues(rawJson);
  if (issues.length > 0) {
    message += `**Issues Found**:\n`;
    issues.forEach((issue, i) => {
      message += `${i + 1}. ${issue}\n`;
    });
    message += '\n';
  }

  // 显示预期格式
  message += `**Expected Format**:\n`;
  message += '```json\n';
  message += generateCorrectExample(tool, {});
  message += '\n```\n\n';

  // 修复建议
  message += `**Common Fixes**:\n`;
  message += `1. Ensure all string values are enclosed in double quotes\n`;
  message += `2. Ensure all object keys are enclosed in double quotes\n`;
  message += `3. Verify all opening braces/brackets have matching closing braces/brackets\n`;
  message += `4. Remove trailing commas (not allowed in strict JSON)\n`;
  message += `5. Escape special characters (like quotes inside strings)\n\n`;

  message += `**Action Required**: Please regenerate the tool call with valid JSON.`;
  message += ` The JSON must be properly formatted according to standard JSON rules.`;

  return message;
}

/**
 * 诊断 JSON 解析问题
 *
 * @param {string} jsonStr - JSON 字符串
 * @returns {Array<string>} 诊断问题列表
 */
function diagnoseParseIssues(jsonStr) {
  const issues = [];

  if (!jsonStr || jsonStr.trim() === '') {
    issues.push('Empty JSON string');
    return issues;
  }

  // 检查引号平衡
  const quotes = (jsonStr.match(/"/g) || []).length;
  if (quotes % 2 !== 0) {
    issues.push(`Unbalanced quotes: ${quotes} quotes found (must be even)`);
  }

  // 检查括号平衡
  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    issues.push(`Unbalanced braces: ${openBraces} { vs ${closeBraces} }`);
  }

  const openBrackets = (jsonStr.match(/\[/g) || []).length;
  const closeBrackets = (jsonStr.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    issues.push(`Unbalanced brackets: ${openBrackets} [ vs ${closeBrackets} ]`);
  }

  // 检查未加引号的键
  const unquotedKeyPattern = /\{\s*([a-zA-Z_]\w*)\s*:/;
  if (unquotedKeyPattern.test(jsonStr)) {
    issues.push('Unquoted object keys detected (e.g., {key: "value"} should be {"key": "value"})');
  }

  // 检查未加引号的字符串值
  const unquotedValuePattern = /:\s*([a-zA-Z_\/][a-zA-Z0-9_\/\s\.-]*)\s*[,}\]]/;
  if (unquotedValuePattern.test(jsonStr)) {
    issues.push('Possible unquoted string values (e.g., {cmd: uv run} should be {"cmd": "uv run"})');
  }

  // 检查尾随逗号（在字符串内部的逗号不算）
  // 排除字符串内部的逗号
  let outsideString = jsonStr.replace(/"[^"]*"/g, '');
  if (/,\s*[}\]]/.test(outsideString)) {
    issues.push('Trailing comma detected (not allowed in strict JSON)');
  }

  // 检查单引号（JSON 只允许双引号）
  // 排除转义的单引号和字符串中的单引号
  const singleQuoteCount = (jsonStr.match(/'/g) || []).length;
  if (singleQuoteCount > 0) {
    // 简单检查是否有单引号包裹的内容
    if (/^'[^']*'$/m.test(jsonStr) || /:\s*'[^']*'/m.test(jsonStr) || /\{\s*'[^']*'/m.test(jsonStr)) {
      issues.push('Single quotes found (JSON requires double quotes for keys and values)');
    }
  }

  // 检查未转义的内部引号
  const unescapedQuotePattern = /:\s*"[^"]*"[^"]*",/g;
  const matches = jsonStr.match(unescapedQuotePattern);
  if (matches && matches.some(m => !m.startsWith('\\'))) {
    issues.push('Possible unescaped quotes inside string values');
  }

  return issues;
}

module.exports = {
  formatRetryMessage,
  formatParseErrorMessage,
  formatParameters,
  diagnoseIssues,
  diagnoseParseIssues,
  generateCorrectExample,
  MAX_RETRIES
};
