import { z } from 'zod';
import { readFile, tailLines } from '../bt-client.js';

export const readFileSchema = z.object({
  path: z.string().describe('服务器上文件的绝对路径，如 /etc/nginx/nginx.conf'),
  last_lines: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .optional()
    .describe('只读取最后 N 行。不填则返回全部内容（注意大文件请务必填此参数）'),
});

export type ReadFileInput = z.infer<typeof readFileSchema>;

export async function handleReadFile(input: ReadFileInput): Promise<string> {
  let content = await readFile(input.path);

  if (input.last_lines !== undefined) {
    content = tailLines(content, input.last_lines);
  }

  if (!content.trim()) {
    return `文件内容为空: \`${input.path}\``;
  }

  const header = input.last_lines
    ? `**路径**: \`${input.path}\`  **显示最后 ${input.last_lines} 行**`
    : `**路径**: \`${input.path}\``;

  return [`## 文件内容`, header, '', '```', content, '```'].join('\n');
}
