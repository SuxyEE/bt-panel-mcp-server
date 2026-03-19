import { z } from 'zod';
import { listSites } from '../bt-client.js';

export const listSitesSchema = z.object({
  search: z.string().optional().describe('按网站名称或域名模糊搜索，不填则返回所有网站'),
});

export type ListSitesInput = z.infer<typeof listSitesSchema>;

export async function handleListSites(input: ListSitesInput): Promise<string> {
  const sites = await listSites(input.search);

  if (sites.length === 0) {
    return '未找到任何网站。';
  }

  const lines = sites.map((s) =>
    `- **${s.name}** (ID: ${s.id})\n  路径: \`${s.path}\`\n  状态: ${s.status === '1' ? '运行中' : '已停用'}  备注: ${s.ps || '无'}`
  );

  return [
    `共找到 **${sites.length}** 个网站：\n`,
    lines.join('\n'),
    '\n使用 `get_nginx_logs` 查询 Nginx 日志，`get_app_logs` 查询应用层日志。',
  ].join('\n');
}
