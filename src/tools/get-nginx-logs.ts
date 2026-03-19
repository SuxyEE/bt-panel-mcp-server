import { z } from 'zod';
import { getNginxAccessLog, getNginxErrorLog, listDir, fileExists, tailLines, readFile } from '../bt-client.js';

export const getNginxLogsSchema = z.object({
  site_name: z.string().describe('网站域名，如 fish.o2oe.net。工具会自动在 /www/wwwlogs/ 下探测日志文件，无需手动指定路径。'),
  log_type: z
    .enum(['access', 'error'])
    .default('access')
    .describe('日志类型：access（Nginx 访问日志，记录每条 HTTP 请求）或 error（Nginx 错误日志，记录文件缺失/配置错误等），默认 access'),
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
    .describe('手动指定日志文件绝对路径（可选）。工具会先自动探测，自动探测失败后才需要填此参数。'),
});

export type GetNginxLogsInput = z.infer<typeof getNginxLogsSchema>;

const NGINX_LOG_DIR = '/www/wwwlogs';

/**
 * 渐进式探测 Nginx 日志路径：
 * 1. 精确匹配 /www/wwwlogs/<site_name>.log
 * 2. 在 /www/wwwlogs/ 目录中模糊匹配包含 site_name 的文件
 * 3. 都找不到则返回 null，提示用户手动提供路径
 */
async function detectNginxLogPath(siteName: string, logType: 'access' | 'error'): Promise<{ path: string; matched: 'exact' | 'fuzzy' } | null> {
  const suffix = logType === 'error' ? '.error.log' : '.log';

  // 第一步：精确匹配
  const exactPath = `${NGINX_LOG_DIR}/${siteName}${suffix}`;
  if (await fileExists(exactPath)) {
    return { path: exactPath, matched: 'exact' };
  }

  // 第二步：列目录，模糊匹配（域名前缀匹配）
  try {
    const files = await listDir(NGINX_LOG_DIR);
    const keyword = siteName.replace(/\./g, '_');

    // 优先匹配包含完整 siteName 的文件，其次匹配 underscore 格式
    const candidates = files.filter((f) => {
      if (f.type !== 'file') return false;
      const name = f.name.toLowerCase();
      return (
        name.endsWith(suffix) &&
        (name.includes(siteName.toLowerCase()) || name.includes(keyword.toLowerCase()))
      );
    });

    if (candidates.length > 0) {
      // 优先选最长匹配（更精确）
      candidates.sort((a, b) => b.name.length - a.name.length);
      return { path: `${NGINX_LOG_DIR}/${candidates[0].name}`, matched: 'fuzzy' };
    }
  } catch {
    // listDir 失败也继续，不中断流程
  }

  return null;
}

export async function handleGetNginxLogs(input: GetNginxLogsInput): Promise<string> {
  const { site_name, log_type, last_lines } = input;
  const logTypeLabel = log_type === 'error' ? '错误日志' : '访问日志';

  // 如果用户手动指定了路径，直接用
  if (input.log_path) {
    let content: string;
    try {
      const raw = await readFile(input.log_path);
      content = tailLines(raw, last_lines);
    } catch (err) {
      throw new Error(`读取指定路径失败（${input.log_path}）: ${err instanceof Error ? err.message : String(err)}`);
    }
    return formatOutput(site_name, logTypeLabel, input.log_path, last_lines, content, '手动指定');
  }

  // 渐进式自动探测
  const detected = await detectNginxLogPath(site_name, log_type);

  if (!detected) {
    // 探测失败，列出 /www/wwwlogs 目录让用户参考
    let dirHint = '';
    try {
      const files = await listDir(NGINX_LOG_DIR);
      const logFiles = files.filter((f) => f.type === 'file' && (f.name.endsWith('.log') || f.name.endsWith('.gz')));
      if (logFiles.length > 0) {
        dirHint = `\n\n**${NGINX_LOG_DIR} 目录下的日志文件：**\n` +
          logFiles.slice(0, 20).map((f) => `- \`${NGINX_LOG_DIR}/${f.name}\``).join('\n') +
          (logFiles.length > 20 ? `\n- ...共 ${logFiles.length} 个文件` : '');
      }
    } catch {
      dirHint = `\n\n（无法列出 ${NGINX_LOG_DIR} 目录，请手动提供 log_path 参数）`;
    }

    return [
      `**未能自动找到 \`${site_name}\` 的 Nginx ${logTypeLabel}。**`,
      '',
      '已尝试路径：',
      `- \`${NGINX_LOG_DIR}/${site_name}${log_type === 'error' ? '.error.log' : '.log'}\`（精确匹配）`,
      `- \`${NGINX_LOG_DIR}/\` 目录下的模糊匹配（包含 ${site_name}）`,
      '',
      '请在参数中补充 `log_path` 指定实际日志文件路径后重试。',
      dirHint,
    ].join('\n');
  }

  // 找到路径，读取内容
  let content: string;
  try {
    const raw = await readFile(detected.path);
    content = tailLines(raw, last_lines);
  } catch (err) {
    throw new Error(`读取日志失败（${detected.path}）: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!content.trim()) {
    return `**${site_name}** 的 Nginx ${logTypeLabel} 内容为空（路径: \`${detected.path}\`）`;
  }

  const matchNote = detected.matched === 'fuzzy' ? '（模糊匹配）' : '';
  return formatOutput(site_name, logTypeLabel, detected.path, last_lines, content, `自动探测${matchNote}`);
}

function formatOutput(
  siteName: string,
  logTypeLabel: string,
  logPath: string,
  lastLines: number,
  content: string,
  source: string
): string {
  return [
    `## ${siteName} — Nginx ${logTypeLabel}（HTTP 请求层）`,
    `> 此为 Nginx 层日志，记录 HTTP 请求信息（IP、URL、状态码、UA 等），不包含业务逻辑/程序报错。如需查看应用层错误请使用 \`get_app_logs\`。`,
    `**路径**: \`${logPath}\`  **来源**: ${source}  **显示最后 ${lastLines} 行**\n`,
    '```',
    content,
    '```',
  ].join('\n');
}
