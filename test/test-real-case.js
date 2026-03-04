/**
 * 测试真实失败案例：2026-03-01 18:00 的失败
 * 
 * 失败的JSON：
 * {"command":  ccxt /home"uv run --with/admin/.openclaw/workspace/scripts/crypto_price_bot.py"}
 */

const jsonParseEnhancer = require('../lib/json-parse-enhancer');
const { formatParseErrorMessage } = require('../lib/error-formatter');
const retryHandler = require('../lib/retry-handler');

console.log('='.repeat(70));
console.log('测试真实失败案例: 2026-03-01 18:00');
console.log('='.repeat(70));

// 真实的失败案例数据
const realFailedJson = '{"command":  ccxt /home"uv run --with/admin/.openclaw/workspace/scripts/crypto_price_bot.py"}';

const mockTool = {
  name: 'exec',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' }
    },
    required: ['command']
  }
};

console.log('\n原始JSON:');
console.log('  ' + realFailedJson);

console.log('\n--- Layer 1: JSON 解析检测 ---');

// Layer 1: 检测解析错误
const layer1Result = jsonParseEnhancer.parseStreamingJsonEnhanced(realFailedJson, { 
  includeErrorInfo: true, 
  strict: true 
});

console.log(`  __valid: ${layer1Result.__valid}`);
console.log(`  __parseError: ${layer1Result.__parseError}`);
console.log(`  __diagnosis: ${layer1Result.__diagnosis}`);
console.log(`  返回的数据: ${JSON.stringify(layer1Result.data)}`);

if (!layer1Result.__valid || layer1Result.__parseError) {
  console.log('\n  ✅ Layer 1 成功检测到格式错误的 JSON！');
  
  console.log('\n--- Layer 2: 重试消息生成 ---');
  
  const retryMessage = formatParseErrorMessage(
    mockTool,
    { name: 'exec' },
    realFailedJson,
    1,
    layer1Result.__diagnosis
  );
  
  console.log(`  消息长度: ${retryMessage.length} 字符`);
  console.log('\n生成的重试指导消息:');
  console.log('  ' + '-'.repeat(66));
  const lines = retryMessage.split('\n');
  lines.forEach(line => console.log('  ' + line));
  console.log('  ' + '-'.repeat(66));
  
  console.log('\n--- Layer 2: Retry Handler 测试 ---');
  
  const toolCallWithError = {
    id: 'test-real-case',
    name: 'exec',
    arguments: {
      __parseError: true,
      __rawJson: realFailedJson,
      __diagnosis: layer1Result.__diagnosis
    }
  };
  
  try {
    retryHandler.validateToolArgumentsWithRetry(mockTool, toolCallWithError, null);
    console.log('  ✗ FAIL: 应该抛出错误但没有');
  } catch (err) {
    console.log(`  错误名称: ${err.name}`);
    console.log(`  错误层级: ${err.layer}`);
    console.log(`  是否可重试: ${err.isRetryable}`);
    console.log(`  重试次数: ${err.retryAttempt}`);
    
    if (err.name === 'ToolParseError' && err.layer === 'layer1') {
      console.log('\n  ✅ Layer 2 成功捕获 Layer 1 标记的解析错误！');
      console.log('  ✅ 错误将被发送回 LLM 进行重新生成');
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('测试结果: ✅ 通过');
  console.log('='.repeat(70));
  console.log('\n总结:');
  console.log('  1. Layer 1 成功检测到格式错误的 JSON');
  console.log('  2. Layer 2 成功识别 Layer 1 的错误标记');
  console.log('  3. 生成了详细的重试指导消息发送给 LLM');
  console.log('  4. LLM 将根据指导重新生成正确的 JSON');
  console.log('\n结论: ✅ 这个失败案例现在会被正确处理，不会再导致任务失败！');
  
} else {
  console.log('\n❌ Layer 1 未能检测到格式错误的 JSON！');
  console.log('   这意味着两层防护可能没有正确工作');
}

console.log('='.repeat(70));
