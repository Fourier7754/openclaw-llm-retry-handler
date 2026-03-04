/**
 * 消息预处理器
 *
 * 在 LLM 接收消息前注入重试指导
 */

/**
 * 创建带重试指导的预处理器
 *
 * @param {Object} options - 配置选项
 * @param {boolean} options.enable - 是否启用预处理器
 * @param {number} options.maxRetries - 最大重试次数
 * @returns {Function} 预处理函数
 */
function createRetryPreprocessor(options = {}) {
  const { enable = true, maxRetries = 3 } = options;

  if (!enable) {
    return async (messages, signal) => messages;
  }

  return async function retryPreprocessor(messages, signal) {
    // 检查是否有重试中的工具调用
    const hasRetryError = messages.some(m =>
      m.role === 'toolResult' &&
      m.content?.some(c =>
        c.text?.includes('Tool validation failed') ||
        c.text?.includes('attempt') && c.text?.includes('regenerate')
      )
    );

    if (!hasRetryError) {
      return messages;
    }

    // 在系统提示后添加重试指导
    const result = [...messages];
    const systemMsgIndex = result.findIndex(m => m.role === 'system');

    const retryGuidance = `

**JSON Formatting Guidelines (Active)**:
The previous tool call failed JSON validation. When regenerating, ensure:

1. **Proper Quoting**: All object keys and string values must be in double quotes
   - Correct: {"command": "ls -la"}
   - Wrong: {command: "ls -la"} or {"command": 'ls -la'}

2. **Complete Values**: Ensure all values are complete, no partial JSON
   - Correct: {"path": "/path/to/workspace"}
   - Wrong: {"path": /path/to/workspace} (missing quotes)

3. **Valid Structure**: No trailing commas, all brackets closed
   - Correct: {"items": ["a", "b"]}
   - Wrong: {"items": ["a", "b"],}

4. **String Escaping**: Properly escape special characters
   - Correct: {"text": "Hello \\"World\\""}
   - Wrong: {"text": "Hello "World""}

Review the error message in the tool result carefully and regenerate the entire tool call with correct formatting.

Maximum retries allowed: ${maxRetries}
`;

    if (systemMsgIndex >= 0) {
      result[systemMsgIndex] = {
        ...result[systemMsgIndex],
        content: result[systemMsgIndex].content + retryGuidance
      };
    } else {
      result.unshift({
        role: 'system',
        content: retryGuidance.trim()
      });
    }

    return result;
  };
}

/**
 * 检测消息是否需要重试指导
 *
 * @param {Array} messages - 消息数组
 * @returns {boolean} 是否需要重试指导
 */
function needsRetryGuidance(messages) {
  return messages.some(m =>
    m.role === 'toolResult' &&
    m.content?.some(c =>
      c.text?.includes('Tool validation failed') ||
      c.text?.includes('attempt') && c.text?.includes('regenerate')
    )
  );
}

/**
 * 提取重试指导（用于调试）
 *
 * @param {Array} messages - 消息数组
 * @returns {Object} 重试信息
 */
function extractRetryInfo(messages) {
  const retryResults = messages
    .filter(m => m.role === 'toolResult')
    .filter(m => m.content?.some(c => c.text?.includes('Tool validation failed')))
    .map(m => ({
      toolCallId: m.toolCallId,
      error: m.content?.find(c => c.text?.includes('Error'))?.text
    }));

  return {
    hasRetryErrors: retryResults.length > 0,
    retryCount: retryResults.length,
    errors: retryResults
  };
}

module.exports = {
  createRetryPreprocessor,
  needsRetryGuidance,
  extractRetryInfo
};
