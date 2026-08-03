#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { listSitesSchema, handleListSites } from './tools/list-sites.js';
import { getNginxLogsSchema, handleGetNginxLogs } from './tools/get-nginx-logs.js';
import { getAppLogsSchema, handleGetAppLogs } from './tools/get-app-logs.js';
import { getPanelLogsSchema, handleGetPanelLogs } from './tools/get-panel-logs.js';
import { getSystemStatusSchema, handleGetSystemStatus } from './tools/get-system-status.js';
import { readFileSchema, handleReadFile } from './tools/read-file.js';
import { manageSitesSchema, handleManageSites } from './tools/manage-sites.js';
import { manageDomainsSchema, handleManageDomains } from './tools/manage-domains.js';
import { manageBackupsSchema, handleManageBackups } from './tools/manage-backups.js';
import {
  manageNginxConfigSchema,
  saveFileSchema,
  handleManageNginxConfig,
  handleSaveFile,
} from './tools/manage-nginx-config.js';
import {
  callOfficialApiSchema,
  getOfficialApiOperationSchema,
  handleCallOfficialApi,
  handleGetOfficialApiOperation,
  handleSearchOfficialApi,
  searchOfficialApiSchema,
} from './tools/official-api.js';

/**
 * BT_MODE 环境变量控制工具集模式：
 *   readonly（默认）：只提供查询/日志类工具，AI 无法执行任何写操作，安全。
 *   full：开放全量工具，包括创建/删除网站、域名管理、备份、文件写入等。
 */
const MODE = (process.env.BT_MODE || 'readonly').toLowerCase();
const IS_FULL = MODE === 'full';

// ── 只读工具（readonly 和 full 都包含）──────────────────
const READONLY_TOOLS: Tool[] = [
  {
    name: 'list_sites',
    description: '列出宝塔面板中所有托管的网站，包括域名、根目录、运行状态。查询日志前先用此工具确认网站名称和路径。',
    inputSchema: zodToJsonSchema(listSitesSchema) as Tool['inputSchema'],
  },
  {
    name: 'get_nginx_logs',
    description:
      '【Nginx 层日志 — HTTP 请求记录】读取 Nginx 的访问日志（access）或错误日志（error）。' +
      '记录的是每一条 HTTP 请求：IP、时间、URL、状态码（200/404/499/502）、响应大小、来源页面、UserAgent。' +
      '适合排查：HTTP 状态码异常、流量来源分析、爬虫/攻击识别、Nginx 配置问题、静态资源 404 等。' +
      '注意：此工具【不包含】任何业务逻辑、数据库、接口报错等应用层信息。' +
      '工具会自动在 /www/wwwlogs/ 目录探测日志路径，无需手动填写。',
    inputSchema: zodToJsonSchema(getNginxLogsSchema) as Tool['inputSchema'],
  },
  {
    name: 'get_app_logs',
    description:
      '【应用层日志 — 业务/程序运行记录】读取后端应用程序自身输出的业务日志。' +
      '记录的是代码运行过程中的 INFO/WARN/ERROR 信息：SQL 报错、接口异常、业务逻辑错误、堆栈跟踪等。' +
      '适合排查：业务逻辑 Bug、数据库异常、第三方接口报错、程序崩溃、性能慢查询等。' +
      '注意：此工具【不包含】HTTP 请求记录，那些属于 Nginx 层，应使用 get_nginx_logs。' +
      '支持框架：Laravel、ThinkPHP、Java、Node.js，默认 auto 自动探测所有常见路径。',
    inputSchema: zodToJsonSchema(getAppLogsSchema) as Tool['inputSchema'],
  },
  {
    name: 'get_panel_logs',
    description:
      '读取宝塔面板自身的操作日志，包括登录记录、配置变更、安装/卸载软件等操作历史。适合审计谁在什么时候操作了面板。',
    inputSchema: zodToJsonSchema(getPanelLogsSchema) as Tool['inputSchema'],
  },
  {
    name: 'get_system_status',
    description:
      '获取服务器实时状态：CPU 使用率、内存占用、磁盘分区使用情况、网络实时流量、系统负载。适合排查性能问题或确认服务器资源是否充足。',
    inputSchema: zodToJsonSchema(getSystemStatusSchema) as Tool['inputSchema'],
  },
  {
    name: 'read_file',
    description:
      '读取服务器上任意文件内容（只读）。适合查看 Nginx 配置文件、PHP 配置、应用配置文件、自定义日志路径等。建议配合 last_lines 参数避免读取超大文件。',
    inputSchema: zodToJsonSchema(readFileSchema) as Tool['inputSchema'],
  },
  {
    name: 'get_nginx_config',
    description:
      '读取指定网站的 Nginx 配置文件（/www/server/panel/vhost/nginx/<域名>.conf）。适合查看反代、SSL、location 规则等配置。只读，不修改。',
    inputSchema: zodToJsonSchema(manageNginxConfigSchema) as Tool['inputSchema'],
  },
  {
    name: 'list_domains',
    description: '查询网站绑定的所有域名列表，包括域名、端口、添加时间。',
    inputSchema: zodToJsonSchema(manageDomainsSchema) as Tool['inputSchema'],
  },
  {
    name: 'list_backups',
    description: '查询网站的备份列表，包括备份 ID、文件名、创建时间。',
    inputSchema: zodToJsonSchema(manageBackupsSchema) as Tool['inputSchema'],
  },
  {
    name: 'search_bt_api',
    description: '搜索当前内置的宝塔官方 API 目录。返回操作 ID、HTTP 路由、必填参数和模块统计；所有模式可用。',
    inputSchema: zodToJsonSchema(searchOfficialApiSchema) as Tool['inputSchema'],
  },
  {
    name: 'get_bt_api_operation',
    description: '获取一个官方宝塔 API 操作的完整参数定义。先用 search_bt_api 找到操作 ID。所有模式可用。',
    inputSchema: zodToJsonSchema(getOfficialApiOperationSchema) as Tool['inputSchema'],
  },
];

// ── 全量工具（仅 BT_MODE=full 时开放）──────────────────
const FULL_TOOLS: Tool[] = [
  {
    name: 'manage_sites',
    description:
      '【full 模式】网站管理：启用/停用/删除/创建网站，修改备注、到期时间，查询 PHP 版本列表，查看网站防跨站/日志状态。',
    inputSchema: zodToJsonSchema(manageSitesSchema) as Tool['inputSchema'],
  },
  {
    name: 'manage_domains',
    description: '【full 模式】域名管理：给网站绑定新域名或删除域名绑定。',
    inputSchema: zodToJsonSchema(manageDomainsSchema) as Tool['inputSchema'],
  },
  {
    name: 'manage_backups',
    description: '【full 模式】备份管理：立即备份网站、删除备份记录。',
    inputSchema: zodToJsonSchema(manageBackupsSchema) as Tool['inputSchema'],
  },
  {
    name: 'save_nginx_config',
    description:
      '【full 模式】保存 Nginx 配置文件（谨慎！保存后立即生效，错误配置会导致网站无法访问）。',
    inputSchema: zodToJsonSchema(manageNginxConfigSchema) as Tool['inputSchema'],
  },
  {
    name: 'save_file',
    description: '【full 模式】写入/覆盖服务器上的任意文件内容（谨慎！）。',
    inputSchema: zodToJsonSchema(saveFileSchema) as Tool['inputSchema'],
  },
  {
    name: 'call_bt_api',
    description: '【full 模式】调用内置官方 API 目录中的任意操作。使用 get_bt_api_operation 核对参数；密钥、request_time、request_token 和 action 自动注入，不能由调用方覆盖。',
    inputSchema: zodToJsonSchema(callOfficialApiSchema) as Tool['inputSchema'],
  },
];

const TOOLS: Tool[] = IS_FULL ? [...READONLY_TOOLS, ...FULL_TOOLS] : READONLY_TOOLS;

const server = new Server(
  { name: 'bt-mcp', version: '0.2.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let text: string;

    switch (name) {
      case 'list_sites': {
        text = await handleListSites(listSitesSchema.parse(args));
        break;
      }
      case 'get_nginx_logs': {
        text = await handleGetNginxLogs(getNginxLogsSchema.parse(args));
        break;
      }
      case 'get_app_logs': {
        text = await handleGetAppLogs(getAppLogsSchema.parse(args));
        break;
      }
      case 'get_panel_logs': {
        text = await handleGetPanelLogs(getPanelLogsSchema.parse(args));
        break;
      }
      case 'get_system_status': {
        text = await handleGetSystemStatus(getSystemStatusSchema.parse(args));
        break;
      }
      case 'read_file': {
        text = await handleReadFile(readFileSchema.parse(args));
        break;
      }
      // 只读版本的配置/域名/备份查询
      case 'get_nginx_config': {
        const input = manageNginxConfigSchema.parse({ ...args, action: 'get' });
        text = await handleManageNginxConfig(input);
        break;
      }
      case 'list_domains': {
        const input = manageDomainsSchema.parse({ ...args, action: 'list' });
        text = await handleManageDomains(input);
        break;
      }
      case 'list_backups': {
        const input = manageBackupsSchema.parse({ ...args, action: 'list' });
        text = await handleManageBackups(input);
        break;
      }
      case 'search_bt_api': {
        text = await handleSearchOfficialApi(searchOfficialApiSchema.parse(args));
        break;
      }
      case 'get_bt_api_operation': {
        text = await handleGetOfficialApiOperation(getOfficialApiOperationSchema.parse(args));
        break;
      }
      // full 模式专用工具
      case 'manage_sites': {
        if (!IS_FULL) throw new Error('此工具需要 BT_MODE=full 才能使用，当前为只读模式');
        text = await handleManageSites(manageSitesSchema.parse(args));
        break;
      }
      case 'manage_domains': {
        if (!IS_FULL) throw new Error('此工具需要 BT_MODE=full 才能使用，当前为只读模式');
        text = await handleManageDomains(manageDomainsSchema.parse(args));
        break;
      }
      case 'manage_backups': {
        if (!IS_FULL) throw new Error('此工具需要 BT_MODE=full 才能使用，当前为只读模式');
        text = await handleManageBackups(manageBackupsSchema.parse(args));
        break;
      }
      case 'save_nginx_config': {
        if (!IS_FULL) throw new Error('此工具需要 BT_MODE=full 才能使用，当前为只读模式');
        text = await handleManageNginxConfig(manageNginxConfigSchema.parse(args));
        break;
      }
      case 'save_file': {
        if (!IS_FULL) throw new Error('此工具需要 BT_MODE=full 才能使用，当前为只读模式');
        text = await handleSaveFile(saveFileSchema.parse(args));
        break;
      }
      case 'call_bt_api': {
        if (!IS_FULL) throw new Error('此工具需要 BT_MODE=full 才能使用，当前为只读模式');
        text = await handleCallOfficialApi(callOfficialApiSchema.parse(args));
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`BT Panel MCP Server running (mode: ${IS_FULL ? 'full' : 'readonly'})\n`);
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
