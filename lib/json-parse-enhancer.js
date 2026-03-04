/**
 * JSON Parse Enhancer - Layer 1 Protection
 *
 * Patches pi-ai's parseStreamingJson to detect and mark parse errors.
 *
 * This layer catches JSON parsing errors during streaming and sets markers
 * that Layer 2 can detect and handle with retry guidance.
 */

const { parse: partialParse } = require('partial-json');

// Track if patch is applied
let patchApplied = false;

/**
 * Enhanced parseStreamingJson with error detection support.
 *
 * This function extends pi-ai's parseStreamingJson to:
 * 1. Detect when JSON parsing completely fails (returns empty object despite having content)
 * 2. Optionally return detailed error information via the includeErrorInfo parameter
 *
 * @param {string} partialJson - The partial JSON string from streaming
 * @param {Object} options - Options for parsing behavior
 * @param {boolean} options.includeErrorInfo - Return error info object
 * @param {boolean} options.strict - Enable strict error detection
 * @returns {Object|Object} Parsed object or error info object
 */
function parseStreamingJsonEnhanced(partialJson, options = {}) {
  const { includeErrorInfo = false, strict = false } = options;

  // Handle empty input
  if (!partialJson || partialJson.trim() === "") {
    return includeErrorInfo
      ? { __valid: true, __empty: true, data: {} }
      : {};
  }

  let standardError = null;

  // Try standard JSON parsing first (fastest for complete JSON)
  try {
    const result = JSON.parse(partialJson);
    return includeErrorInfo
      ? { __valid: true, data: result }
      : result;
  } catch (stdError) {
    standardError = stdError;
  }

  // Try partial-json for incomplete JSON
  try {
    const parsed = partialParse(partialJson);
    const result = parsed ?? {};

    // Detect parsing state
    const isEmpty = Object.keys(result).length === 0;
    const hasContent = partialJson.trim().length > 0;
    const hasStructure = /[\{\[]/.test(partialJson);

    // Additional checks for malformed JSON that partial-json might accept
    const hasTrailingComma = /,\s*[}\]]/.test(partialJson);
    const hasSingleQuotes = /'[^']*'/.test(partialJson);
    const hasMalformedStructure = !hasStructure && hasContent && partialJson.trim().startsWith('{');

    if (includeErrorInfo) {
      // Strict mode: mark as error if we have content but got empty result
      // OR if we detect known malformed patterns
      if ((isEmpty && hasContent && hasStructure) ||
          (strict && (hasTrailingComma || hasSingleQuotes || hasMalformedStructure))) {
        return {
          __valid: false,
          __parseError: true,
          __rawJson: partialJson,
          __originalError: standardError?.message || 'Unknown parse error',
          __diagnosis: diagnoseQuick(partialJson),
          data: result
        };
      }
      // Successfully parsed as partial JSON
      return { __valid: true, __partial: true, data: result };
    }

    // Standard mode: just return the result
    // But in strict mode, if we got empty result with content, add error markers
    if (strict && isEmpty && hasContent && hasStructure) {
      // Add error markers directly to the result for Layer 2 detection
      result.__parseError = true;
      result.__rawJson = partialJson;
    }

    return result;
  } catch (partialError) {
    // All parsing attempts failed
    if (includeErrorInfo) {
      return {
        __valid: false,
        __parseError: true,
        __rawJson: partialJson,
        __originalError: partialError.message || standardError?.message || 'Unknown parse error',
        __diagnosis: diagnoseQuick(partialJson),
        data: {}
      };
    }
    return {};
  }
}

/**
 * Quick diagnosis of JSON parsing issues.
 * Returns a brief description of the problem.
 *
 * @param {string} jsonStr - The JSON string that failed to parse
 * @returns {string} Brief diagnosis
 */
function diagnoseQuick(jsonStr) {
  if (!jsonStr || jsonStr.trim() === '') {
    return 'Empty JSON string';
  }

  // Check for quote balance
  const quotes = (jsonStr.match(/"/g) || []).length;
  if (quotes % 2 !== 0) {
    return `Unbalanced quotes (${quotes} quotes found)`;
  }

  // Check for brace/bracket balance
  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  const openBrackets = (jsonStr.match(/\[/g) || []).length;
  const closeBrackets = (jsonStr.match(/\]/g) || []).length;

  if (openBraces !== closeBraces) {
    return `Unbalanced braces (${openBraces} { vs ${closeBraces} })`;
  }
  if (openBrackets !== closeBrackets) {
    return `Unbalanced brackets (${openBrackets} [ vs ${closeBrackets} ])`;
  }

  // Check for common syntax errors
  if (/^\s*\{\s*\w+\s*:/.test(jsonStr)) {
    return 'Unquoted object keys detected';
  }

  if (/,\s*[}\]]/.test(jsonStr)) {
    return 'Trailing comma detected';
  }

  if (/:\s*[^"\{\[\w\d]/.test(jsonStr)) {
    return 'Possible unquoted string value';
  }

  return 'Malformed JSON structure';
}

/**
 * Apply the patch to pi-ai's json-parse module.
 *
 * This function monkey-patches the parseStreamingJson function in
 * @mariozechner/pi-ai/dist/utils/json-parse.js to use our enhanced version.
 *
 * @returns {boolean} True if patch was applied successfully
 */
function patchParseStreamingJson(options = {}) {
  if (patchApplied) {
    console.log('[LLM-RETRY-L1] Parse streaming JSON patch already applied');
    return true;
  }

  try {
    // Try to require the pi-ai json-parse module
    const jsonParsePath = require.resolve('@mariozechner/pi-ai/dist/utils/json-parse.js');
    delete require.cache[jsonParsePath];

    const jsonParseModule = require('@mariozechner/pi-ai/dist/utils/json-parse.js');

    // Save original function
    const originalParseStreamingJson = jsonParseModule.parseStreamingJson;

    // Create enhanced version that passes through to original but adds error detection
    const enhancedParse = function(partialJson) {
      const strict = options.strict !== false; // Default to strict mode
      return parseStreamingJsonEnhanced(partialJson, { strict });
    };

    // Replace the function
    jsonParseModule.parseStreamingJson = enhancedParse;

    patchApplied = true;
    console.log('[LLM-RETRY-L1] ✓ Enhanced parseStreamingJson patch applied');
    console.log(`[LLM-RETRY-L1]   - Strict mode: ${options.strict !== false ? 'enabled' : 'disabled'}`);
    console.log(`[LLM-RETRY-L1]   - Original function preserved`);

    return true;

  } catch (err) {
    console.error('[LLM-RETRY-L1] ✗ Failed to apply parseStreamingJson patch:', err.message);
    console.error('[LLM-RETRY-L1]   Path attempted:', '@mariozechner/pi-ai/dist/utils/json-parse.js');
    return false;
  }
}

/**
 * Remove the patch and restore original function.
 *
 * @returns {boolean} True if patch was removed successfully
 */
function unpatchParseStreamingJson() {
  if (!patchApplied) {
    return true;
  }

  try {
    // Reload the module to restore original
    const jsonParsePath = require.resolve('@mariozechner/pi-ai/dist/utils/json-parse.js');
    delete require.cache[jsonParsePath];

    patchApplied = false;
    console.log('[LLM-RETRY-L1] ✓ Parse streaming JSON patch removed');
    return true;

  } catch (err) {
    console.error('[LLM-RETRY-L1] ✗ Failed to remove patch:', err.message);
    return false;
  }
}

/**
 * Check if the Layer 1 patch is currently applied.
 *
 * @returns {boolean} True if patch is applied
 */
function isLayer1Applied() {
  return patchApplied;
}

/**
 * Test the enhanced parser with various JSON strings.
 * Useful for debugging and verification.
 *
 * @returns {Object} Test results
 */
function runTests() {
  const testCases = [
    { name: 'Valid JSON', input: '{"command": "ls -la"}' },
    { name: 'Partial JSON', input: '{"command": "ls' },
    { name: 'Unquoted value', input: '{"command": uv run script.py}' },
    { name: 'Unbalanced quotes', input: '{"command": "ls}' },
    { name: 'Trailing comma', input: '{"command": "ls",}' },
    { name: 'Empty', input: '' },
    { name: 'Malformed', input: '{command uv run}' },
  ];

  const results = [];

  for (const test of testCases) {
    const result = parseStreamingJsonEnhanced(test.input, { includeErrorInfo: true, strict: true });
    results.push({
      name: test.name,
      input: test.input,
      valid: result.__valid,
      parseError: result.__parseError,
      partial: result.__partial,
      empty: result.__empty,
      diagnosis: result.__diagnosis,
      data: result.data
    });
  }

  return results;
}

module.exports = {
  // Core functions
  parseStreamingJsonEnhanced,
  patchParseStreamingJson,
  unpatchParseStreamingJson,

  // Utilities
  diagnoseQuick,
  runTests,
  isLayer1Applied,

  // Constants
  LAYER_NAME: 'JSON Parse Enhancer (Layer 1)'
};
