import { z } from 'zod';
import { listSites, listBackups, createBackup, deleteBackup } from '../bt-client.js';

export const manageBackupsSchema = z.object({
  action: z.enum(['list', 'create', 'delete']).describe(
    'list：查看网站备份列表 | create：立即备份网站 | delete：删除某个备份'
  ),
  site_name: z.string().describe('网站名称（主域名）'),
  backup_id: z.number().int().optional().describe('【delete】备份记录 ID，从 list 结果中获取'),
});

export type ManageBackupsInput = z.infer<typeof manageBackupsSchema>;

export async function handleManageBackups(input: ManageBackupsInput): Promise<string> {
  const sites = await listSites(input.site_name);
  const site = sites.find((s) => s.name === input.site_name) || sites[0];
  if (!site) throw new Error(`未找到网站 "${input.site_name}"，请先用 list_sites 确认`);

  const siteId = site.id;

  switch (input.action) {
    case 'list': {
      const backups = await listBackups(siteId);
      if (!backups.length) return `网站 **${input.site_name}** 暂无备份记录。`;
      const rows = backups.map((b) => `| ${b.id} | ${b.name} | ${b.addtime} |`).join('\n');
      return `## ${input.site_name} 备份列表\n\n| ID | 备份名 | 创建时间 |\n|----|--------|----------|\n${rows}`;
    }
    case 'create': {
      const r = await createBackup(siteId);
      return `网站 **${input.site_name}** 备份任务已提交。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    case 'delete': {
      if (!input.backup_id) throw new Error('delete 操作需要提供 backup_id（备份 ID）');
      const r = await deleteBackup(input.backup_id);
      return `备份 ID **${input.backup_id}** 已删除。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    default:
      throw new Error(`未知操作: ${input.action}`);
  }
}
