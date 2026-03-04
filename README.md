# @openclaw/llm-retry-handler

LLM-based JSON validation retry handler for OpenClaw.

Provides two-layer protection for LLM JSON parsing and validation:
- **Layer 1**: JSON parsing error detection and marking
- **Layer 2**: Schema validation with automatic retry guidance

## Installation

```bash
npm install @openclaw/llm-retry-handler
# or
cd /path/to/openclaw-llm-retry-handler
npm install
```

## Usage

### Method 1: OpenClaw Hook System (Recommended for 2026.3.2+)

This method integrates with OpenClaw's hook system and requires no code changes.

**1. Copy hook to OpenClaw hooks directory:**

```bash
# Create hook directory
mkdir -p ~/.openclaw/hooks/llm-retry-handler

# Copy files
cp index.js ~/.openclaw/hooks/llm-retry-handler/
cp hook.js ~/.openclaw/hooks/llm-retry-handler/
```

**2. Create HOOK.md:**

```markdown
---
name: llm-retry-handler
description: "LLM-based JSON validation retry handler for OpenClaw"
metadata:
  {
    "openclaw":
      {
        "emoji": "🔄",
        "events": ["pre:llm:call"],
      },
  }
---
```

**3. Configure in `~/.openclaw/openclaw.json`:**

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "llm-retry-handler": {
          "enabled": true,
          "config": {
            "enableLayer1": true,
            "enableLayer2": true,
            "strict": true,
            "logStats": false
          }
        }
      }
    }
  }
}
```

**4. Restart gateway:**

```bash
openclaw gateway restart
```

**5. Verify installation:**

```bash
openclaw hooks list
```

### Method 2: Direct Patch (Legacy)

This method directly patches the `@mariozechner/pi-ai` module.

```javascript
const retryHandler = require('@openclaw/llm-retry-handler');

// Apply patches
retryHandler.patch({
  enableLayer1: true,  // JSON parsing error detection
  enableLayer2: true,  // Schema validation with retry
  strict: true         // Strict mode (recommended)
});

console.log('[LLM-RETRY] Two-layer protection enabled');
```

Can be used in:
- Agent entry files
- Extension configuration (e.g., `~/.openclaw/extensions/qqbot/config.js`)
- Any Node.js script that imports OpenClaw modules

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable or disable the handler |
| `enableLayer1` | boolean | `true` | Enable Layer 1: JSON parsing error detection |
| `enableLayer2` | boolean | `true` | Enable Layer 2: Schema validation with retry |
| `strict` | boolean | `true` | Enable strict mode for Layer 1 |
| `logStats` | boolean | `false` | Log statistics periodically (every 5 minutes) |
| `maxRetries` | number | `3` | Maximum retry attempts |

## Monitoring

Get statistics at runtime:

```javascript
const retryHandler = require('@openclaw/llm-retry-handler');

// Get stats
const stats = retryHandler.getStats();
console.log(stats);

// Print formatted stats
retryHandler.printStats();

// Check patch status
const status = retryHandler.getStatus();
console.log(status);
```

## How It Works

```
┌─────────────────┐
│  LLM Response   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│   Layer 1: Parse Check   │
│   - Detects JSON errors  │
│   - Marks invalid data   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Layer 2: Validation    │
│   - Schema validation    │
│   - Retry with guidance  │
│   - Max 3 attempts       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Valid Result or       │
│   Final Error           │
└─────────────────────────┘
```

## Troubleshooting

**Hook not showing in `openclaw hooks list`:**
- Ensure `hooks.internal.enabled` is `true` in config
- Check hook files exist in `~/.openclaw/hooks/llm-retry-handler/`
- Verify HOOK.md has correct frontmatter

**Patches not applied:**
- Check logs for errors: `tail -f /tmp/openclaw/openclaw-*.log`
- Verify `@mariozechner/pi-ai` is accessible
- Try running gateway in dev mode for more logs

## License

MIT
