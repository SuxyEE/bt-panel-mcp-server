import { z } from 'zod';
import { getPanelLogs } from '../bt-client.js';

export const getPanelLogsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30)
    .describe('返回最近 N 条面板操作日志，默认 30，最大 100'),
});

export type GetPanelLogsInput = z.infer<typeof getPanelLogsSchema>;

export async function handleGetPanelLogs(input: GetPanelLogsInput): Promise<string> {
  const logs = await getPanelLogs(input.limit) as Record<string, string>[];

  if (!logs || logs.length === 0) {
    return '暂无面板操作日志。';
  }

  const lines = logs.map((log, i) => {
    const time = log['time'] || log['addtime'] || '';
    const user = log['username'] || log['user'] || '未知用户';
    const type = log['type'] || '';
    const ps = log['ps'] || log['msg'] || JSON.stringify(log);
    return `${i + 1}. \`${time}\` [${user}] ${type ? `[${type}] ` : ''}${ps}`;
  });

  return [`## 宝塔面板操作日志（最近 ${logs.length} 条）\n`, lines.join('\n')].join('\n');
}
