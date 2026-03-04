/**
 * Demo script for @openclaw/llm-retry-handler
 *
 * Run this to see how the retry handler works
 */

const { formatRetryMessage } = require('./lib/error-formatter');
const { createPreprocessor } = require('./index');

console.log('='.repeat(60));
console.log('LLM Retry Handler Demo');
console.log('='.repeat(60));
console.log();

// Demo 1: Error formatting
console.log('Demo 1: Error Message Formatting');
console.log('-'.repeat(60));

const tool = {
  name: 'exec',
  parameters: {
    properties: {
      command: {
        type: 'string',
        description: 'Command to execute'
      }
    },
    required: ['command']
  }
};

const toolCall = {
  id: 'call-123',
  name: 'exec',
  arguments: {
    partialJson: '{"command": uv run /path/to/workspace/script.py"}'
  }
};

const error = new Error('Unexpected token c in JSON at position 15');
const retryMessage = formatRetryMessage(tool, toolCall, error, 1);

console.log(retryMessage);
console.log();

// Demo 2: Preprocessor
console.log('Demo 2: Message Preprocessing');
console.log('-'.repeat(60));

const preprocessor = createPreprocessor({ maxRetries: 3 });

const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  {
    role: 'user',
    content: 'Run the crypto price bot'
  },
  {
    role: 'assistant',
    content: 'I will run the crypto price bot for you.'
  },
  {
    role: 'toolResult',
    toolCallId: 'call-123',
    content: [{
      text: 'Tool validation failed for "exec" (attempt 1/3):\n\n**Error**: Unexpected token c in JSON at position 15\n\n**Action Required**: Please regenerate the tool call.'
    }]
  }
];

console.log('Original system message:');
console.log(messages[0].content);
console.log();

preprocessor(messages, null).then(processed => {
  console.log('Enhanced system message:');
  console.log(processed[0].content);
  console.log();

  // Demo 3: Statistics
  console.log('Demo 3: Statistics');
  console.log('-'.repeat(60));
  const retryHandler = require('./index');
  console.log('Current statistics:');
  console.log(JSON.stringify(retryHandler.getStats(), null, 2));
  console.log();

  console.log('='.repeat(60));
  console.log('Demo complete!');
  console.log('='.repeat(60));
}).catch(err => {
  console.error('Error:', err.message);
});
