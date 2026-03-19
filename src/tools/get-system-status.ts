import { z } from 'zod';
import { getSystemStatus, getNetworkStatus, getDiskInfo } from '../bt-client.js';

export const getSystemStatusSchema = z.object({});

export type GetSystemStatusInput = z.infer<typeof getSystemStatusSchema>;

export async function handleGetSystemStatus(_input: GetSystemStatusInput): Promise<string> {
  const [sys, net, disks] = await Promise.all([
    getSystemStatus(),
    getNetworkStatus(),
    getDiskInfo(),
  ]);

  const memUsedPct = sys.memTotal > 0 ? Math.round((sys.memRealUsed / sys.memTotal) * 100) : 0;
  const loadBar = (v: number, max: number) => {
    const pct = Math.min(Math.round((v / max) * 20), 20);
    return '█'.repeat(pct) + '░'.repeat(20 - pct);
  };

  const diskLines = disks.map((d) => {
    const [total, used, free, pct] = d.size;
    return `  - \`${d.path}\`  总量: ${total}  已用: ${used} (${pct})  可用: ${free}`;
  });

  const lines = [
    `## 服务器实时状态`,
    '',
    `**系统**: ${sys.system || '未知'}  **面板版本**: ${sys.version || '未知'}  **运行时长**: ${sys.time || '未知'}`,
    '',
    `### CPU`,
    `- 核心数: ${sys.cpuNum}  当前使用率: **${sys.cpuRealUsed}%**`,
    `- 负载: 1分钟 ${net.load?.one ?? '-'}  5分钟 ${net.load?.five ?? '-'}  15分钟 ${net.load?.fifteen ?? '-'}`,
    '',
    `### 内存`,
    `- 总量: ${sys.memTotal} MB  已用: ${sys.memRealUsed} MB (${memUsedPct}%)  可用: ${sys.memFree} MB`,
    `- ${loadBar(sys.memRealUsed, sys.memTotal)} ${memUsedPct}%`,
    '',
    `### 网络（实时）`,
    `- 下行: ${net.down?.toFixed(2) ?? '-'} KB/s  上行: ${net.up?.toFixed(2) ?? '-'} KB/s`,
    '',
    `### 磁盘`,
    ...diskLines,
  ];

  return lines.join('\n');
}
