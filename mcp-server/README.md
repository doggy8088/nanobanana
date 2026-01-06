# @willh/nano-banana-mcp

MCP server for Nano Banana - 使用 Gemini 進行圖片生成與編修的 MCP 伺服器。

## 安裝與使用

```bash
npx @willh/nano-banana-mcp
```

## 環境變數設定

需設定 `NANOBANANA_API_KEY` API Key 環境變數：

### 模型選擇

預設使用 `gemini-3.1-flash-image-preview`。若要使用其他模型可參考：

```bash
export NANOBANANA_MODEL=gemini-3-pro-image-preview
```

或：

```bash
export NANOBANANA_MODEL=gemini-2.5-flash-image
```

## MCP 工具

此 MCP server 提供以下工具：

| 工具 | 說明 |
| ------ | ------ |
| `generate_image` | 文字轉圖片生成（支援風格/變化選項） |
| `edit_image` | 圖片編修 |
| `restore_image` | 圖片修復 |
| `generate_icon` | 生成多尺寸 App 圖示、Favicon、UI 元件 |
| `generate_pattern` | 生成無縫拼接圖樣與材質 |
| `generate_story` | 生成視覺故事或流程序列圖 |
| `generate_diagram` | 生成技術圖表、流程圖、架構示意 |

## MCP 設定範例

### Claude Desktop

設定檔位置：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "npx",
      "args": ["-y", "@willh/nano-banana-mcp"],
      "env": {
        "NANOBANANA_API_KEY": "your-api-key"
      }
    }
  }
}
```

### GitHub Copilot Chat (VS Code)

在專案根目錄建立 `.vscode/mcp.json`：

```json
{
  "servers": {
    "nanobanana": {
      "command": "npx",
      "args": ["-y", "@willh/nano-banana-mcp"],
      "env": {
        "NANOBANANA_API_KEY": "${input:nanobanana-api-key}"
      }
    }
  },
  "inputs": [
    {
      "id": "nanobanana-api-key",
      "type": "promptString",
      "description": "Enter your Gemini API key",
      "password": true
    }
  ]
}
```

或透過 VS Code 設定檔 `settings.json`：

```json
{
  "chat.mcp.discovery.enabled": true,
  "mcp.servers": {
    "nanobanana": {
      "command": "npx",
      "args": ["-y", "@willh/nano-banana-mcp"],
      "env": {
        "NANOBANANA_API_KEY": "your-api-key"
      }
    }
  }
}
```

命令列安裝：

```bash
code --add-mcp "{\"name\":\"nanobanana\",\"command\":\"npx\",\"args\":[\"-y\",\"@willh/nano-banana-mcp\"],\"env\":{\"NANOBANANA_API_KEY\":\"your-api-key\"}}"
```

### Codex CLI

設定檔位置：`~/.codex/config.toml`

```toml
[mcp_servers.nanobanana]
command = "npx"
args = ["-y", "@willh/nano-banana-mcp"]

[mcp_servers.nanobanana.env]
NANOBANANA_API_KEY = "your-api-key"
```

命令列安裝：

```bash
codex mcp add nanobanana --env NANOBANANA_API_KEY=your-api-key -- npx -y @willh/nano-banana-mcp
```

### Claude Code

命令列安裝：

```bash
claude mcp add nanobanana --env NANOBANANA_API_KEY=your-api-key -- npx -y @willh/nano-banana-mcp
```

或直接編輯設定檔 `~/.claude/settings.json`：

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "npx",
      "args": ["-y", "@willh/nano-banana-mcp"],
      "env": {
        "NANOBANANA_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

在專案根目錄建立 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "npx",
      "args": ["-y", "@willh/nano-banana-mcp"],
      "env": {
        "NANOBANANA_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Windsurf

設定檔位置：`~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "npx",
      "args": ["-y", "@willh/nano-banana-mcp"],
      "env": {
        "NANOBANANA_API_KEY": "your-api-key"
      }
    }
  }
}
```

## 搭配 Gemini CLI 使用

此套件也是 [Nano Banana Gemini CLI 擴充套件](https://github.com/doggy8088/nanobanana) 的一部分。

## 授權

Apache-2.0
