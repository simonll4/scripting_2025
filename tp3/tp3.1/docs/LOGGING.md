# 📋 TP3.1 Logging Configuration Guide

## 🗂️ Directory Structure
```
tp3.1/
├── agent/
│   ├── agent.toml          # Agent configuration
│   └── src/                # Agent source code
├── clp/
│   ├── clp.toml           # CLP configuration  
│   └── src/               # CLP source code
└── logs/                  # ✨ Log files directory (same level as agent/clp)
    ├── agent.log          # Agent log file
    └── clp.log            # CLP log file
```

## ⚙️ Current Configuration

### Agent (`agent/agent.toml`)
```toml
[logging]
debug = false
level = "info"              # debug, info, warn, error
output = "console"          # console, file, or empty/unset for both
file_path = "../logs/agent.log"
```

### CLP (`clp/clp.toml`)
```toml
[logging]
debug = false
level = "info"              # debug, info, warn, error
output = "file"             # console or file (CLP uses file to keep CLI clean)
file_path = "../logs/clp.log"
```

## 🎯 Configuration Options

### Debug Mode
Set `debug = true` to enable debug-level messages:
```toml
[logging]
debug = true
level = "debug"
```

### Output Options

#### Agent (Full Options)
- `"console"` - Only output to terminal
- `""` or unset - **Default to BOTH** console and file  
- `"both"` option removed - use empty/unset for both outputs

#### CLP (Simplified Options)
- `"console"` - Output to terminal (not recommended for interactive CLI)
- `"file"` - Output to log file (recommended to keep CLI clean)

### Log Levels (in priority order)
1. `"error"` - Only errors
2. `"warn"` - Warnings and errors
3. `"info"` - Info, warnings, and errors (default)
4. `"debug"` - All messages (requires debug = true)

### Two Independent Filters

#### 1. **`level`** - Priority Filter
```javascript
const LOG_LEVELS = {
  error: 0,    // Highest priority
  warn: 1,
  info: 2,
  debug: 3     // Lowest priority
};
```

#### 2. **`debug`** - Debug Switch
- `debug = false` → **Blocks ALL debug messages** (regardless of level)
- `debug = true` → Allows debug messages (if level also permits)

### Examples
- `debug = true` + `level = "info"` → Shows error/warn/info, **blocks debug**
- `debug = true` + `level = "debug"` → Shows **all messages**
- `debug = false` + `level = "debug"` → Shows error/warn/info, **blocks debug**

## 🚀 Usage Examples

### For Development/Debugging
```toml
[logging]
debug = true
level = "debug"
# output = ""          # Empty = both console and file
```

### For Production
```toml
[logging]
debug = false
level = "info"
output = "file"        # File only
```

### For Lab Demonstrations
```toml
# Agent - show activity in console only
[logging]
debug = false
level = "info"
output = "console"

# CLP - keep console clean, log to file only
[logging]
debug = false
level = "info"
output = "file"
```

## ✅ Verification

The logging system automatically:
1. Creates the `logs/` directory if it doesn't exist
2. Creates log files when first used
3. Appends new log entries with timestamps
4. Filters messages based on level and debug settings
5. **Defaults to "both" if output is empty/unset**

### Test Commands
```bash
# Test with empty output (should default to both)
cd agent && node -e "
import { loadAgentConfig } from './src/config/index.js';
import { logger } from './src/shared/logger.js';
const config = loadAgentConfig();
config.logging.output = '';  // Test empty
logger.configure(config.logging);
logger.info('test', { message: 'Testing empty output = both' });
"
```

## 📊 Log Format
All logs use structured JSON format:
```json
{
  "ts": "2025-09-17T02:33:58.501Z",
  "level": "info", 
  "event": "startup_test",
  "message": "CLP logging configured from TOML",
  "config": {...}
}
```

This format makes logs easy to parse, search, and analyze! 🎉