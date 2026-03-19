import { z } from 'zod';
import {
  listSites,
  createSite,
  deleteSite,
  stopSite,
  startSite,
  setSiteNote,
  setSiteExpiry,
  getPhpVersions,
  getSiteInfo,
} from '../bt-client.js';

export const manageSitesSchema = z.object({
  action: z.enum([
    'start',
    'stop',
    'delete',
    'create',
    'set_note',
    'set_expiry',
    'get_php_versions',
    'get_site_info',
  ]).describe(
    'start/stop：启用或停用网站 | delete：删除网站 | create：创建新网站 | set_note：修改备注 | set_expiry：设置到期时间 | get_php_versions：查询已安装 PHP 版本 | get_site_info：查询网站防跨站/运行目录/日志状态'
  ),
  site_name: z.string().optional().describe('网站名称（主域名），start/stop/delete/set_note/set_expiry/get_site_info 必填'),
  site_id: z.number().int().optional().describe('网站 ID，优先使用。未知时可先 list_sites 查询'),
  // create 专用
  path: z.string().optional().describe('【create】网站根目录，如 /www/wwwroot/example.com'),
  php_version: z.string().optional().describe('【create】PHP 版本，如 74、80、81，默认 74'),
  port: z.number().int().optional().describe('【create】端口，默认 80'),
  note: z.string().optional().describe('【create/set_note】备注内容'),
  // delete 专用
  delete_ftp: z.boolean().optional().describe('【delete】同时删除关联 FTP，默认 false'),
  delete_db: z.boolean().optional().describe('【delete】同时删除关联数据库，默认 false'),
  delete_path: z.boolean().optional().describe('【delete】同时删除网站根目录文件，默认 false'),
  // set_expiry 专用
  edate: z.string().optional().describe('【set_expiry】到期日期，格式 YYYY-MM-DD，永久填 0000-00-00'),
});

export type ManageSitesInput = z.infer<typeof manageSitesSchema>;

export async function handleManageSites(input: ManageSitesInput): Promise<string> {
  const { action } = input;

  if (action === 'get_php_versions') {
    const result = await getPhpVersions();
    return `## 已安装 PHP 版本\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
  }

  if (action === 'create') {
    if (!input.site_name) throw new Error('create 操作需要提供 site_name（域名）');
    if (!input.path) throw new Error('create 操作需要提供 path（网站根目录）');
    const result = await createSite({
      domain: input.site_name,
      path: input.path,
      phpVersion: input.php_version,
      port: input.port,
      ps: input.note,
    });
    return `## 创建网站结果\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
  }

  // 其余操作都需要 site_name 或 site_id
  const siteName = input.site_name;
  if (!siteName) throw new Error('此操作需要提供 site_name');

  // 若没有传 id，自动查询
  let siteId = input.site_id;
  let sitePath = '';
  if (!siteId || action === 'get_site_info') {
    const sites = await listSites(siteName);
    const site = sites.find((s) => s.name === siteName) || sites[0];
    if (!site) throw new Error(`未找到网站 "${siteName}"，请先用 list_sites 确认`);
    siteId = site.id;
    sitePath = site.path;
  }

  switch (action) {
    case 'start': {
      const r = await startSite(siteId!, siteName);
      return `网站 **${siteName}** 已启用。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    case 'stop': {
      const r = await stopSite(siteId!, siteName);
      return `网站 **${siteName}** 已停用。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    case 'delete': {
      const r = await deleteSite(siteId!, siteName, {
        deleteFtp: input.delete_ftp,
        deleteDb: input.delete_db,
        deletePath: input.delete_path,
      });
      return `网站 **${siteName}** 已删除。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    case 'set_note': {
      if (!input.note) throw new Error('set_note 操作需要提供 note（备注内容）');
      const r = await setSiteNote(siteId!, input.note);
      return `网站 **${siteName}** 备注已更新为「${input.note}」。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    case 'set_expiry': {
      if (!input.edate) throw new Error('set_expiry 操作需要提供 edate（到期日期）');
      const r = await setSiteExpiry(siteId!, input.edate);
      return `网站 **${siteName}** 到期时间已设置为 ${input.edate}。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    case 'get_site_info': {
      const r = await getSiteInfo(siteId!, sitePath);
      return `## ${siteName} 网站配置状态\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    default:
      throw new Error(`未知操作: ${action}`);
  }
}
