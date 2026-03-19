import { z } from 'zod';
import { getNginxConfig, saveNginxConfig, saveFileContent } from '../bt-client.js';

export const manageNginxConfigSchema = z.object({
  action: z.enum(['get', 'save']).describe(
    'get：读取 Nginx 配置文件内容 | save：保存修改后的配置内容（谨慎操作，保存后即生效）'
  ),
  site_name: z.string().describe('网站名称（主域名），对应 /www/server/panel/vhost/nginx/<site_name>.conf'),
  content: z.string().optional().describe('【save】新的配置文件内容，完整替换原文件'),
});

export const saveFileSchema = z.object({
  path: z.string().describe('文件绝对路径，如 /www/wwwroot/example.com/config.php'),
  content: z.string().describe('文件内容，将完整覆盖原文件'),
});

export type ManageNginxConfigInput = z.infer<typeof manageNginxConfigSchema>;
export type SaveFileInput = z.infer<typeof saveFileSchema>;

export async function handleManageNginxConfig(input: ManageNginxConfigInput): Promise<string> {
  switch (input.action) {
    case 'get': {
      const content = await getNginxConfig(input.site_name);
      return [
        `## ${input.site_name} Nginx 配置`,
        `> 路径: \`/www/server/panel/vhost/nginx/${input.site_name}.conf\``,
        '```nginx',
        content,
        '```',
      ].join('\n');
    }
    case 'save': {
      if (!input.content) throw new Error('save 操作需要提供 content（配置内容）');
      const r = await saveNginxConfig(input.site_name, input.content);
      return `Nginx 配置已保存。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
    }
    default:
      throw new Error(`未知操作: ${input.action}`);
  }
}

export async function handleSaveFile(input: SaveFileInput): Promise<string> {
  const r = await saveFileContent(input.path, input.content);
  return `文件已保存到 \`${input.path}\`。\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\``;
}
