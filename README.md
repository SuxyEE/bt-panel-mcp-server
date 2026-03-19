# bt-panel-mcp-server

宝塔面板（BT Panel）MCP Server，让任意支持 MCP 协议的 AI 助手直接用自然语言查询服务器日志、管理网站、查看系统状态，不用再手动登录面板。

[![npm version](https://img.shields.io/npm/v/bt-panel-mcp-server.svg)](https://www.npmjs.com/package/bt-panel-mcp-server) [![npm downloads](https://img.shields.io/npm/dm/bt-panel-mcp-server.svg)](https://www.npmjs.com/package/bt-panel-mcp-server) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[GitHub](https://github.com/SuxyEE/bt-panel-mcp-server) | [npm](https://www.npmjs.com/package/bt-panel-mcp-server)

默认 **只读模式**，设置 `BT_MODE=full` 可开启全量管理工具。

---

## 这能做什么？

在任意支持 MCP 协议的 AI 工具（Cursor、Claude Desktop、Windsurf、Cline、Cherry Studio 等）的对话里直接说：

**查询日志 & 监控**
> "帮我看看 example.com 最近的 Nginx 错误日志"
>
> "查一下 shop.com 的 Laravel 日志有没有报错"
>
> "服务器现在 CPU 和内存使用情况怎么样？"

**一键建站部署**（需要 `BT_MODE=full`）
> "帮我生成一个小龙虾餐厅落地页，暗红色主题，部署到 claw.example.com，完成后给我访问地址"
>
> "把刚才生成的活动报名 HTML 直接部署到服务器，用 IP 访问就行"
>
> "把 example.com 首页的联系电话改成 138xxxxxxxx，直接更新到服务器"

**网站 & 域名管理**（需要 `BT_MODE=full`）
>  "帮我给 example.com 备份一下"
>
> "给 example.com 绑定一个新域名 www.example.com"
>
> "停用 test.example.com 这个测试站"

---

## 快速开始

### 第一步：开启宝塔面板 API

1. 登录宝塔面板 → 左侧菜单「面板设置」→「API 接口」
2. 开启 API，复制「接口密钥」（API Key）
3. 在 IP 白名单中添加你的本机 IP（必须，否则请求会被拒绝）
4. 记下面板地址，如 `http://你的服务器IP:8888`

> 如果面板开启了「安全入口」，地址需要带上安全路径，如 `https://IP:端口/安全路径`

### 第二步：配置 MCP

各 AI 工具的配置文件路径不同，找到对应的文件编辑即可：

| AI 工具 | 系统 | 配置文件路径 |
|---------|------|-------------|
| Cursor | Windows | `%USERPROFILE%\.cursor\mcp.json` |
| Cursor | macOS / Linux | `~/.cursor/mcp.json` |
| Claude Desktop | Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Desktop | macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windsurf | Windows | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` |
| Windsurf | macOS | `~/.codeium/windsurf/mcp_config.json` |
| Cherry Studio | — | 设置 → MCP 服务器 → 添加 |
| Cline / Roo Code | — | 插件设置 → MCP Servers |
| 其他工具 | — | 参考对应工具文档中"MCP Server"配置说明 |

**推荐：npx 方式（无需手动下载，始终使用最新版）**

```json
{
  "mcpServers": {
    "bt-panel": {
      "command": "npx",
      "args": ["-y", "bt-panel-mcp-server"],
      "env": {
        "BT_PANEL_URL": "http://你的服务器IP:8888",
        "BT_API_KEY": "你的API密钥",
        "BT_MODE": "readonly"
      }
    }
  }
}
```

**本地方式（已克隆源码时使用）**

```json
{
  "mcpServers": {
    "bt-panel": {
      "command": "node",
      "args": ["本地路径/bt-panel-mcp-server/dist/index.js"],
      "env": {
        "BT_PANEL_URL": "http://你的服务器IP:8888",
        "BT_API_KEY": "你的API密钥",
        "BT_MODE": "readonly"
      }
    }
  }
}
```

**替换以下内容：**
- `http://你的服务器IP:8888` → 你的宝塔面板地址
- `你的API密钥` → 第一步复制的接口密钥
- `BT_MODE` → `readonly`（只读，默认）或 `full`（全量管理，含写操作）

### 第三步：重启 AI 工具

完全退出并重新打开你的 AI 工具，然后测试：

```
列出宝塔面板所有网站
```

---

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `BT_PANEL_URL` | ✅ | — | 宝塔面板地址，如 `http://192.168.1.100:8888`，支持 HTTPS 和安全入口路径 |
| `BT_API_KEY` | ✅ | — | 宝塔面板 API 接口密钥 |
| `BT_MODE` | 否 | `readonly` | 工具集模式：`readonly` 只读安全模式 / `full` 全量管理模式（含写操作） |

---

## 工具模式说明

### readonly 模式（默认，安全）

只包含查询和读取工具，AI 无法对服务器做任何修改：

| 工具 | 说明 |
|------|------|
| `list_sites` | 列出所有网站 |
| `get_nginx_logs` | 读取 Nginx 访问/错误日志（自动探测路径） |
| `get_app_logs` | 读取应用层业务日志（自动探测框架路径） |
| `get_panel_logs` | 读取面板操作日志 |
| `get_system_status` | 查询 CPU/内存/磁盘/网络实时状态 |
| `read_file` | 读取服务器任意文件（只读） |
| `get_nginx_config` | 读取网站 Nginx 配置文件（只读） |
| `list_domains` | 查询网站绑定的域名列表 |
| `list_backups` | 查询网站备份列表 |

### full 模式（`BT_MODE=full`）

在 readonly 所有工具基础上，额外开放：

| 工具 | 说明 |
|------|------|
| `manage_sites` | 创建/删除/启用/停用网站，修改备注、到期时间 |
| `manage_domains` | 绑定/解绑域名 |
| `manage_backups` | 立即备份/删除备份 |
| `save_nginx_config` | 修改保存 Nginx 配置（⚠️ 谨慎，即时生效） |
| `save_file` | 写入服务器文件（⚠️ 谨慎） |

---

## 工具详细说明

### `list_sites` — 列出所有网站

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `search` | string | 否 | 按网站名称模糊搜索 |

---

### `get_nginx_logs` — 查询 Nginx 日志（自动探测路径）

> 工具会自动在 `/www/wwwlogs/` 目录下探测日志文件，无需手动填写路径；探测失败时会列出目录内容供参考。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `site_name` | string | ✅ | — | 网站域名，如 `example.com` |
| `log_type` | string | 否 | `access` | `access`（访问日志）或 `error`（错误日志） |
| `last_lines` | number | 否 | `200` | 读取最后 N 行（最大 2000） |
| `log_path` | string | 否 | — | 手动指定路径（自动探测失败时使用） |

---

### `get_app_logs` — 查询应用层日志（自动探测框架路径）

> 工具会自动在网站根目录下按框架候选路径逐一探测，`framework: auto` 时尝试所有常见框架；探测失败时列出目录结构供参考。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `site_name` | string | 二选一 | — | 网站名称，自动推断路径 |
| `log_path` | string | 二选一 | — | 手动指定日志文件绝对路径 |
| `framework` | string | 否 | `auto` | `auto`（自动）/ `laravel` / `thinkphp` / `java` / `nodejs` |
| `last_lines` | number | 否 | `200` | 读取最后 N 行（最大 2000） |

**各框架自动探测路径：**

| 框架 | 候选路径 |
|------|----------|
| Laravel | `storage/logs/laravel.log`、`storage/logs/app.log` |
| ThinkPHP | `runtime/log`、`runtime/logs/app.log` |
| Java | `logs/app.log`、`logs/error.log`、`app.log` |
| Node.js | `logs/app.log`、`logs/error.log`、`out.log` |

---

### `get_panel_logs` — 查询面板操作日志

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `limit` | number | 否 | `30` | 返回最近 N 条记录（最大 100） |

---

### `get_system_status` — 查询服务器状态

无需参数，返回 CPU、内存、磁盘、网络实时数据。

---

### `read_file` — 读取任意文件

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | ✅ | 文件绝对路径 |
| `last_lines` | number | 否 | 只读最后 N 行，大文件必填 |

---

### `get_nginx_config` — 读取 Nginx 配置

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `site_name` | string | ✅ | 网站名称（域名） |

---

### `manage_sites` — 网站管理（full 模式）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | string | ✅ | `start` / `stop` / `delete` / `create` / `set_note` / `set_expiry` / `get_php_versions` / `get_site_info` |
| `site_name` | string | 视情况 | 网站名称 |
| `path` | string | create 必填 | 网站根目录 |
| `php_version` | string | 否 | PHP 版本，如 `74`、`80`、`81` |
| `note` | string | 否 | 备注 |
| `edate` | string | set_expiry 必填 | 到期日期（`YYYY-MM-DD` 或 `0000-00-00` 永久） |
| `delete_ftp` / `delete_db` / `delete_path` | boolean | 否 | delete 时是否同时删除关联资源 |

---

### `manage_domains` — 域名管理（full 模式）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | string | ✅ | `list` / `add` / `delete` |
| `site_name` | string | ✅ | 网站名称 |
| `domain` | string | add/delete 必填 | 要操作的域名 |
| `port` | number | 否 | 端口，默认 80 |

---

### `manage_backups` — 备份管理（full 模式）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | string | ✅ | `list` / `create` / `delete` |
| `site_name` | string | ✅ | 网站名称 |
| `backup_id` | number | delete 必填 | 备份 ID（从 list 获取） |

---

## 对话使用示例

**日志排查**
```
查看 example.com 最近 500 行 Nginx 错误日志
example.com 最近有哪些 502 错误？
查看 shop.com 的 Laravel 日志有没有 Exception
```

**系统状态**
```
服务器现在 CPU 和内存使用率多少？
磁盘还有多少空间？
```

**网站管理（full 模式）**
```
帮我立即备份 example.com
给 example.com 添加域名 www.example.com
停用 example.com
```

**配置查看**
```
读取 example.com 的 Nginx 配置
查看 /www/wwwroot/example.com/.env 文件
```

---

## 🚀 场景案例：AI 生成网站 → 一键部署上线

> 需要 `BT_MODE=full`

这是 bt-mcp 最有趣的使用场景之一：**让 AI 帮你生成网站内容，然后直接部署到服务器，全程不用手动登录面板。**

---

### 案例一：小龙虾餐厅落地页（OpenClaw 风格）

**你对 AI 说：**

> "帮我生成一个小龙虾餐厅的宣传落地页，暗红色主题，要有菜单、价格、联系方式，风格现代感强，然后部署到服务器，域名用 claw.myrestaurant.com"

**AI 自动执行的步骤：**

```
第一步：生成 HTML
  ↓ AI 生成完整的 index.html（暗红主题、菜单卡片、价格表、微信/电话联系）

第二步：调用 manage_sites（action=create）
  domain: claw.myrestaurant.com
  path:   /www/wwwroot/claw.myrestaurant.com
  → 宝塔自动创建目录 + Nginx 配置

第三步：调用 save_file
  path:    /www/wwwroot/claw.myrestaurant.com/index.html
  content: <刚生成的 HTML>
  → 文件写入服务器

第四步：返回访问地址
  ✅ 部署完成！访问地址：http://claw.myrestaurant.com
  ⚠️ 记得把域名 DNS 解析到你服务器的 IP
```

整个过程 **30 秒内完成**，你只需要去域名商把 DNS 指向服务器 IP 即可。

---

### 案例二：没有域名，用 IP 临时预览

**你对 AI 说：**

> "帮我生成一个活动报名页，直接用服务器 IP 访问就行，不用配域名"

AI 会把域名字段填写为服务器 IP，宝塔建站后直接 `http://服务器IP` 访问。

---

### 案例三：已有网站，AI 更新内容

**你对 AI 说：**

> "把 claw.myrestaurant.com 首页的营业时间改成 10:00-22:00，夏季特供区加一道'麻辣小龙虾拼盘 128元'"

AI 会：
1. `read_file` 读取现有 `index.html`
2. 修改对应文字
3. `save_file` 写回服务器

**完全不用手动 SSH 或登录面板。**

---

### 完整工作流示意

```
你的想法（自然语言）
       ↓
   AI 生成 HTML
       ↓
 bt-mcp 创建网站目录
       ↓
 bt-mcp 写入 index.html
       ↓
  域名解析（手动，一次性）
       ↓
   🌐 网站上线
```

> **提示**：如果你的域名已经解析好，整个从「提需求」到「能访问」的过程可以压缩到 1 分钟以内。

---

## 常见问题

**Q：提示 "Missing required environment variables"？**

检查 `BT_PANEL_URL` 和 `BT_API_KEY` 是否正确填写，重启你的 AI 工具。

**Q：提示请求失败或连接超时？**

1. 确认宝塔面板地址和端口正确（默认 8888）
2. 确认已在宝塔 API 设置中添加了**你的本机 IP** 到白名单
3. 如果面板开启了 HTTPS 或安全入口，地址要包含完整路径（如 `https://IP:端口/安全路径`）

**Q：读取日志提示文件不存在？**

- Nginx 日志需要先在宝塔面板开启「访问日志」（网站设置 → 日志）
- 工具会自动探测并列出目录结构，根据提示补充 `log_path` 参数即可

**Q：日志内容太多，AI 回复很慢？**

使用 `last_lines` 参数限制读取行数，建议不超过 500 行。

**Q：full 模式会有什么风险？**

`save_nginx_config` 和 `save_file` 是写操作，配置错误可能导致网站无法访问。建议在熟悉 AI 行为后再开启 `BT_MODE=full`，平时保持默认 `readonly`。

---

## 本地开发

```bash
cd E:\tools\bt-mcp
npm install --ignore-scripts
npm run build
node dist/index.js   # 输出 "BT Panel MCP Server running (mode: readonly)"
```

监听文件变化自动重新编译：

```bash
npm run dev
```

---

## 技术栈

- **语言**：TypeScript
- **运行时**：Node.js >= 18
- **MCP SDK**：`@modelcontextprotocol/sdk`

---

## License

MIT

---

## 联系作者

如有问题或建议，欢迎微信交流：

![微信联系方式](./lxfs.jpg)
