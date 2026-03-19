import { z } from 'zod';
import { listSites, listDomains, addDomain, deleteDomain } from '../bt-client.js';

export const manageDomainsSchema = z.object({
  action: z.enum(['list', 'add', 'delete']).describe(
    'list：查询网站域名列表 | add：绑定新域名 | delete：删除域名绑定'
  ),
  site_name: z.string().describe('网站名称（主域名），用于定位网站'),
  domain: z.string().optional().describe('【add/delete】要操作的域名，如 www.example.com'),
  port: z.number().int().optional().describe('【add/delete】域名端口，默认 80'),
});

export type ManageDomainsInput = z.infer<typeof manageDomainsSchema>;

export async function handleManageDomains(input: ManageDomainsInput): Promise<string> {
  const sites = await listSites(input.site_name);
  const site = sites.find((s) => s.name === input.site_name) || sites[0];
  if (!site) throw new Error(`未找到网站 "${input.site_name}"，请先用 list_sites 确认`);

  const siteId = site.id;

  switch (input.action) {
    case 'list': {
      const domains = await listDomains(siteId);
      if (!domains.length) return `网站 **${input.site_name}** 暂无绑定域名。`;
      const rows = domains.map((d) => `| ${d.name} | ${d.port} | ${d.addtime} |`).join('\n');
      return `## ${input.site_name} 域名列表\n\n| 域名 | 端口 | 添加时间 |\n|------|------|----------|\n${rows}`;
    }
    case 'add': {
      if (!input.domain) throw new Error('add 操作需要提供 domain（域名）');
      const r = await addDomain(siteId, input.site_name, input.domain, input.port);
      return `域名 **${input.domain}** 已绑定到 ${input.site_name}。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    case 'delete': {
      if (!input.domain) throw new Error('delete 操作需要提供 domain（域名）');
      const r = await deleteDomain(siteId, input.site_name, input.domain, input.port);
      return `域名 **${input.domain}** 已从 ${input.site_name} 解绑。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    default:
      throw new Error(`未知操作: ${input.action}`);
  }
}
