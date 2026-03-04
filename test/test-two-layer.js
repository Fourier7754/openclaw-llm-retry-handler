/**
 * Two-Layer Protection Integration Tests
 *
 * Tests the interaction between Layer 1 (parse detection) and Layer 2 (validation/retry)
 */

const jsonParseEnhancer = require('../lib/json-parse-enhancer');
const { formatParseErrorMessage, diagnoseParseIssues } = require('../lib/error-formatter');
const retryHandler = require('../lib/retry-handler');

console.log('='.repeat(60));
console.log('Two-Layer Protection Integration Tests');
console.log('='.repeat(60));

// Test Suite 1: Layer 1 - JSON Parse Enhancer
console.log('\n\n--- Test Suite 1: Layer 1 - JSON Parse Enhancer ---\n');

function testLayer1ParseEnhancer() {
  console.log('Test 1.1: Valid JSON should parse successfully');
  const validJson = '{"command": "ls -la", "path": "/path/to/home"}';
  const result1 = jsonParseEnhancer.parseStreamingJsonEnhanced(validJson, { includeErrorInfo: true, strict: true });
  console.log(`  Input: ${validJson}`);
  console.log(`  __valid: ${result1.__valid}`);
  console.log(`  __parseError: ${result1.__parseError}`);
  console.log(`  Result: ${result1.__valid && !result1.__parseError ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 1.2: Malformed JSON (unquoted value) should be detected');
  const malformedJson = '{"command": uv run script.py}';
  const result2 = jsonParseEnhancer.parseStreamingJsonEnhanced(malformedJson, { includeErrorInfo: true, strict: true });
  console.log(`  Input: ${malformedJson}`);
  console.log(`  __valid: ${result2.__valid}`);
  console.log(`  __parseError: ${result2.__parseError}`);
  console.log(`  __diagnosis: ${result2.__diagnosis}`);
  console.log(`  Result: ${!result2.__valid && result2.__parseError ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 1.3: Unbalanced quotes (partial JSON) should parse as partial');
  const unbalancedJson = '{"command": "ls}';
  const result3 = jsonParseEnhancer.parseStreamingJsonEnhanced(unbalancedJson, { includeErrorInfo: true, strict: true });
  console.log(`  Input: ${unbalancedJson}`);
  console.log(`  __valid: ${result3.__valid}`);
  console.log(`  __partial: ${result3.__partial}`);
  console.log(`  __parseError: ${result3.__parseError}`);
  console.log(`  Note: {"command": "ls} is valid partial JSON (incomplete string), so parse succeeds as partial`);
  console.log(`  Result: ${result3.__valid && result3.__partial ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 1.4: Partial JSON should parse as partial');
  const partialJson = '{"command": "ls';
  const result4 = jsonParseEnhancer.parseStreamingJsonEnhanced(partialJson, { includeErrorInfo: true, strict: true });
  console.log(`  Input: ${partialJson}`);
  console.log(`  __valid: ${result4.__valid}`);
  console.log(`  __partial: ${result4.__partial}`);
  console.log(`  Result: ${result4.__valid && result4.__partial ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 1.5: Empty JSON should return empty object');
  const emptyJson = '';
  const result5 = jsonParseEnhancer.parseStreamingJsonEnhanced(emptyJson, { includeErrorInfo: true, strict: true });
  console.log(`  Input: (empty string)`);
  console.log(`  __valid: ${result5.__valid}`);
  console.log(`  __empty: ${result5.__empty}`);
  console.log(`  Result: ${result5.__valid && result5.__empty ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 1.6: Trailing comma should be diagnosed');
  const trailingCommaJson = '{"command": "ls",}';
  const result6 = jsonParseEnhancer.parseStreamingJsonEnhanced(trailingCommaJson, { includeErrorInfo: true, strict: true });
  console.log(`  Input: ${trailingCommaJson}`);
  console.log(`  __valid: ${result6.__valid}`);
  console.log(`  __parseError: ${result6.__parseError}`);
  console.log(`  __diagnosis: ${result6.__diagnosis}`);
  console.log(`  Result: ${!result6.__valid && result6.__parseError ? '✓ PASS' : '✗ FAIL'}`);
}

testLayer1ParseEnhancer();

// Test Suite 2: Layer 1 - Error Diagnosis
console.log('\n\n--- Test Suite 2: Layer 1 - Error Diagnosis ---\n');

function testErrorDiagnosis() {
  console.log('Test 2.1: Diagnose unbalanced quotes');
  const issues1 = diagnoseParseIssues('{"command": "ls}');
  console.log(`  Input: {"command": "ls}`);
  console.log(`  Issues: ${JSON.stringify(issues1)}`);
  console.log(`  Result: ${issues1.some(i => i.includes('quotes')) ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 2.2: Diagnose unquoted keys');
  const issues2 = diagnoseParseIssues('{command: "ls"}');
  console.log(`  Input: {command: "ls"}`);
  console.log(`  Issues: ${JSON.stringify(issues2)}`);
  console.log(`  Result: ${issues2.some(i => i.includes('Unquoted')) ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 2.3: Diagnose trailing comma');
  const issues3 = diagnoseParseIssues('{"command": "ls",}');
  console.log(`  Input: {"command": "ls",}`);
  console.log(`  Issues: ${JSON.stringify(issues3)}`);
  console.log(`  Result: ${issues3.some(i => i.toLowerCase().includes('trailing')) ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 2.4: Diagnose unbalanced braces');
  const issues4 = diagnoseParseIssues('{"command": "ls"');
  console.log(`  Input: {"command": "ls"`);
  console.log(`  Issues: ${JSON.stringify(issues4)}`);
  console.log(`  Result: ${issues4.some(i => i.includes('braces') || i.includes('brackets')) ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 2.5: Diagnose single quotes');
  const issues5 = diagnoseParseIssues("{'command': 'ls'}");
  console.log(`  Input: {'command': 'ls'}`);
  console.log(`  Issues: ${JSON.stringify(issues5)}`);
  console.log(`  Result: ${issues5.some(i => i.includes('single') || i.includes('double')) ? '✓ PASS' : '✗ FAIL'}`);
}

testErrorDiagnosis();

// Test Suite 3: Layer 2 - Parse Error Message Formatting
console.log('\n\n--- Test Suite 3: Layer 2 - Parse Error Message Formatting ---\n');

function testParseErrorMessageFormatting() {
  const mockTool = {
    name: 'exec',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        path: { type: 'string', description: 'Working directory' }
      },
      required: ['command']
    }
  };

  const mockToolCall = {
    id: 'test-123',
    name: 'exec',
    arguments: { __parseError: true, __rawJson: '{"command": uv run}' }
  };

  console.log('Test 3.1: Generate parse error message');
  const message = formatParseErrorMessage(mockTool, mockToolCall, '{"command": uv run}', 1, 'Possible unquoted string values');
  console.log(`  Tool: ${mockTool.name}`);
  console.log(`  Raw JSON: {"command": uv run}`);
  console.log(`  Message length: ${message.length} characters`);
  console.log(`  Contains "Invalid JSON": ${message.includes('Invalid JSON') ? 'Yes' : 'No'}`);
  console.log(`  Contains "Common Fixes": ${message.includes('Common Fixes') ? 'Yes' : 'No'}`);
  console.log(`  Contains "Action Required": ${message.includes('Action Required') ? 'Yes' : 'No'}`);
  console.log(`  Result: ${message.length > 200 && message.includes('Invalid JSON') ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 3.2: Message includes diagnosis');
  console.log(`  Contains diagnosis section: ${message.includes('Issues Found') ? 'Yes' : 'No'}`);
  console.log(`  Result: ${message.includes('Issues Found') ? '✓ PASS' : '✗ FAIL'}`);

  console.log('\nTest 3.3: Message includes expected format example');
  console.log(`  Contains expected format: ${message.includes('Expected Format') ? 'Yes' : 'No'}`);
  console.log(`  Result: ${message.includes('Expected Format') ? '✓ PASS' : '✗ FAIL'}`);
}

testParseErrorMessageFormatting();

// Test Suite 4: Layer 2 - Retry Handler Parse Error Detection
console.log('\n\n--- Test Suite 4: Layer 2 - Retry Handler Parse Error Detection ---\n');

function testRetryHandlerParseDetection() {
  const mockTool = {
    name: 'exec',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' }
      },
      required: ['command']
    }
  };

  console.log('Test 4.1: Detect __parseError marker in arguments');
  const toolCall1 = {
    id: 'test-1',
    name: 'exec',
    arguments: { __parseError: true, __rawJson: '{"command": uv run}' }
  };

  try {
    retryHandler.validateToolArgumentsWithRetry(mockTool, toolCall1, null);
    console.log(`  Result: ✗ FAIL (should have thrown error)`);
  } catch (err) {
    console.log(`  Error name: ${err.name}`);
    console.log(`  Error layer: ${err.layer}`);
    console.log(`  Is ToolParseError: ${err.name === 'ToolParseError' ? 'Yes' : 'No'}`);
    console.log(`  Result: ${err.name === 'ToolParseError' && err.layer === 'layer1' ? '✓ PASS' : '✗ FAIL'}`);
  }

  console.log('\nTest 4.2: Detect parseError marker on toolCall');
  const toolCall2 = {
    id: 'test-2',
    name: 'exec',
    parseError: true,
    partialJson: '{"command": "ls}'
  };

  try {
    retryHandler.validateToolArgumentsWithRetry(mockTool, toolCall2, null);
    console.log(`  Result: ✗ FAIL (should have thrown error)`);
  } catch (err) {
    console.log(`  Error name: ${err.name}`);
    console.log(`  Error layer: ${err.layer}`);
    console.log(`  Result: ${err.name === 'ToolParseError' && err.layer === 'layer1' ? '✓ PASS' : '✗ FAIL'}`);
  }

  console.log('\nTest 4.3: Normal validation (no parse error) should pass');
  const toolCall3 = {
    id: 'test-3',
    name: 'exec',
    arguments: { command: 'ls -la' }
  };

  try {
    const result = retryHandler.validateToolArgumentsWithRetry(mockTool, toolCall3, null);
    console.log(`  Result: ${result.command === 'ls -la' ? '✓ PASS' : '✗ FAIL'}`);
  } catch (err) {
    console.log(`  Result: ✗ FAIL (unexpected error: ${err.message})`);
  }
}

testRetryHandlerParseDetection();

// Test Suite 5: Integration - End-to-End Two-Layer Flow
console.log('\n\n--- Test Suite 5: Integration - End-to-End Two-Layer Flow ---\n');

function testEndToEndFlow() {
  console.log('Test 5.1: Simulate real-world malformed JSON from LLM');
  console.log('  Scenario: LLM generates: {"command":  ccxt /home"uv run --with/admin/.openclaw/workspace/scripts/crypto_price_bot.py"}');

  const malformedJson = '{"command":  ccxt /home"uv run --with/admin/.openclaw/workspace/scripts/crypto_price_bot.py"}';

  // Layer 1: Parse detection
  console.log('\n  Layer 1: Parse detection');
  const layer1Result = jsonParseEnhancer.parseStreamingJsonEnhanced(malformedJson, { includeErrorInfo: true, strict: true });
  console.log(`    __parseError: ${layer1Result.__parseError}`);
  console.log(`    __diagnosis: ${layer1Result.__diagnosis}`);

  // Layer 2: Error message formatting
  console.log('\n  Layer 2: Error message formatting');
  const mockTool = {
    name: 'exec',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' }
      },
      required: ['command']
    }
  };

  const retryMessage = formatParseErrorMessage(
    mockTool,
    { name: 'exec' },
    malformedJson,
    1,
    layer1Result.__diagnosis
  );

  console.log(`    Message generated: ${retryMessage.length} chars`);
  console.log(`    Contains diagnosis: ${retryMessage.includes('Issues Found') ? 'Yes' : 'No'}`);
  console.log(`    Contains fixes: ${retryMessage.includes('Common Fixes') ? 'Yes' : 'No'}`);

  console.log('\n  Result:');
  const passed = layer1Result.__parseError && retryMessage.length > 200;
  console.log(`    ${passed ? '✓ PASS' : '✗ FAIL'} - Two-layer protection correctly handled malformed JSON`);

  console.log('\n  Generated retry message preview:');
  console.log('    ' + '-'.repeat(56));
  const lines = retryMessage.split('\n').slice(0, 15);
  lines.forEach(line => console.log('    ' + line));
  if (retryMessage.split('\n').length > 15) {
    console.log('    ... (truncated)');
  }
  console.log('    ' + '-'.repeat(56));
}

testEndToEndFlow();

// Test Suite 6: Run built-in tests
console.log('\n\n--- Test Suite 6: Built-in Tests ---\n');

function runBuiltInTests() {
  console.log('Running jsonParseEnhancer.runTests()...');
  const testResults = jsonParseEnhancer.runTests();

  console.log('\nResults:');
  testResults.forEach(test => {
    const icon = test.valid && !test.parseError ? '✓' :
                 test.parseError ? '⚠' : '✗';
    console.log(`  ${icon} ${test.name}`);
    if (test.diagnosis) {
      console.log(`     Diagnosis: ${test.diagnosis}`);
    }
    if (!test.valid) {
      console.log(`     Data: ${JSON.stringify(test.data)}`);
    }
  });

  const allDetected = testResults.every(t => {
    if (t.name === 'Valid JSON') {
      return t.valid && !t.parseError;
    } else if (t.name === 'Partial JSON' || t.name === 'Unbalanced quotes') {
      // Partial JSON and unbalanced quotes should be valid with partial flag
      return t.valid && t.partial;
    } else if (t.name === 'Empty') {
      return t.valid && t.empty;
    } else {
      // For malformed cases (Unquoted value, Trailing comma, Malformed), we expect parseError=true
      return t.parseError === true;
    }
  });
  console.log(`\n  Result: ${allDetected ? '✓ PASS' : '✗ FAIL'} - All test cases handled correctly`);
}

runBuiltInTests();

// Summary
console.log('\n\n' + '='.repeat(60));
console.log('Test Summary');
console.log('='.repeat(60));
console.log('All test suites completed.');
console.log('Review results above to verify two-layer protection is working correctly.');
console.log('='.repeat(60));
