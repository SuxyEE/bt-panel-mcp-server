import { z } from 'zod';
import { listSites, listDir, fileExists, tailLines, readFile } from '../bt-client.js';

export const getAppLogsSchema = z.object({
  site_name: z
    .string()
    .optional()
    .describe(
      '网站名称（域名），工具会自动探测网站根目录下常见框架的日志路径（Laravel/ThinkPHP/Java/Node.js 等）。与 log_path 二选一，优先自动探测。'
    ),
  framework: z
    .enum(['laravel', 'thinkphp', 'java', 'nodejs', 'auto'])
    .default('auto')
    .describe('应用框架类型，默认 auto（自动逐一探测所有常见路径）。log_path 已填时忽略此参数'),
  last_lines: z
    .number()
    .int()
    .min(10)
    .max(2000)
    .default(200)
    .describe('读取最后 N 行，默认 200，最大 2000'),
  log_path: z
    .string()
    .optional()
    .describe(
      '手动指定日志文件绝对路径，如 /www/wwwroot/example.com/storage/logs/laravel.log。工具会先自动探测，探测失败后才需要填此参数。'
    ),
});

export type GetAppLogsInput = z.infer<typeof getAppLogsSchema>;

/** 各框架候选日志路径（相对于网站根目录）*/
const FRAMEWORK_CANDIDATES: Record<string, string[]> = {
  laravel: ['storage/logs/laravel.log', 'storage/logs/app.log'],
  thinkphp: ['runtime/log', 'runtime/logs/app.log'],
  java: ['logs/app.log', 'logs/error.log', 'app.log'],
  nodejs: ['logs/app.log', 'logs/error.log', 'app.log', 'out.log'],
};

/** 所有框架候选路径（auto 模式下按此顺序探测）*/
const ALL_CANDIDATES = [
  'storage/logs/laravel.log',
  'storage/logs/app.log',
  'runtime/log',
  'runtime/logs/app.log',
  'logs/app.log',
  'logs/error.log',
  'app.log',
  'out.log',
  'log/app.log',
];

/**
 * 在给定网站根目录下渐进式探测应用日志路径：
 * 1. 若指定了 framework，优先按该框架的候选路径探测
 * 2. auto 模式则按 ALL_CANDIDATES 逐一尝试
 * 3. 都找不到则列出根目录结构供参考
 */
async function detectAppLogPath(
  sitePath: string,
  framework: string
): Promise<{ path: string; matched: 'framework' | 'auto' } | { candidates: string[]; dirTree: string }> {
  const candidates = framework !== 'auto' && FRAMEWORK_CANDIDATES[framework]
    ? FRAMEWORK_CANDIDATES[framework]
    : ALL_CANDIDATES;

  for (const rel of candidates) {
    const absPath = `${sitePath}/${rel}`;
    if (await fileExists(absPath)) {
      return { path: absPath, matched: framework !== 'auto' ? 'framework' : 'auto' };
    }
  }

  // 探测失败，列出网站根目录结构供用户参考
  let dirTree = '';
  try {
    const entries = await listDir(sitePath);
    dirTree = entries
      .slice(0, 30)
      .map((e) => `${e.type === 'dir' ? '📁' : '📄'} ${e.name}`)
      .join('\n');
  } catch {
    dirTree = '（无法列出目录）';
  }

  return {
    candidates: candidates.map((c) => `${sitePath}/${c}`),
    dirTree,
  };
}

export async function handleGetAppLogs(input: GetAppLogsInput): Promise<string> {
  // 如果用户手动指定了路径，直接读取
  if (input.log_path) {
    let content: string;
    try {
      const raw = await readFile(input.log_path);
      content = tailLines(raw, input.last_lines);
    } catch (err) {
      throw new Error(
        `读取指定路径失败（${input.log_path}）: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return formatOutput(input.log_path, input.last_lines, content, '手动指定');
  }

  if (!input.site_name) {
    throw new Error('请提供 log_path（日志文件绝对路径）或 site_name（网站名称）之一');
  }

  // 查找网站根目录
  const sites = await listSites(input.site_name);
  const site = sites.find((s) => s.name === input.site_name) || sites[0];
  if (!site) {
    throw new Error(`未找到网站 "${input.site_name}"，请先用 list_sites 确认网站名称`);
  }

  const sitePath = site.path;

  // 渐进式探测
  const detected = await detectAppLogPath(sitePath, input.framework);

  // 探测失败
  if ('candidates' in detected) {
    return [
      `**未能自动找到 \`${input.site_name}\` 的应用层日志。**`,
      '',
      `网站根目录: \`${sitePath}\``,
      '',
      '已尝试以下路径均不存在：',
      detected.candidates.map((p) => `- \`${p}\``).join('\n'),
      '',
      `**网站根目录结构：**\n\`\`\`\n${detected.dirTree}\n\`\`\``,
      '',
      '请根据以上目录结构，在参数中补充 `log_path` 指定实际日志文件路径后重试。',
    ].join('\n');
  }

  // 读取日志
  let content: string;
  try {
    const raw = await readFile(detected.path);
    content = tailLines(raw, input.last_lines);
  } catch (err) {
    throw new Error(
      `读取应用日志失败（路径: ${detected.path}）: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!content.trim()) {
    return `应用日志为空（路径: \`${detected.path}\`，网站根目录: \`${sitePath}\`）`;
  }

  const matchNote = detected.matched === 'framework' ? `框架(${input.framework})匹配` : '自动探测';
  return formatOutput(detected.path, input.last_lines, content, matchNote);
}

function formatOutput(logPath: string, lastLines: number, content: string, source: string): string {
  return [
    `## 应用层日志（业务/程序运行记录）`,
    `> 此为应用程序自身输出的业务日志，包含 SQL/接口/逻辑错误、堆栈跟踪等。如需查看 HTTP 请求记录请使用 \`get_nginx_logs\`。`,
    `**路径**: \`${logPath}\`  **来源**: ${source}  **显示最后 ${lastLines} 行**\n`,
    '```',
    content,
    '```',
  ].join('\n');
}
