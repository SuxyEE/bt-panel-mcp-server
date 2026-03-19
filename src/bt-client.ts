import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URLSearchParams } from 'url';

export interface BtConfig {
  panelUrl: string;
  apiKey: string;
}

export interface SiteInfo {
  id: number;
  name: string;
  path: string;
  status: string;
  ps: string;
  addtime: string;
  edate: string;
}

export interface SystemStatus {
  system: string;
  version: string;
  time: string;
  cpuNum: number;
  cpuRealUsed: number;
  memTotal: number;
  memRealUsed: number;
  memFree: number;
}

export interface NetworkStatus {
  down: number;
  up: number;
  cpu: [number, number];
  mem: { memFree: number; memTotal: number; memRealUsed: number };
  load: { one: number; five: number; fifteen: number };
}

export interface DiskInfo {
  path: string;
  size: [string, string, string, string];
}

function getSignature(apiKey: string): { request_time: number; request_token: string } {
  const request_time = Math.floor(Date.now() / 1000);
  const md5Key = crypto.createHash('md5').update(apiKey).digest('hex');
  const request_token = crypto.createHash('md5').update(String(request_time) + md5Key).digest('hex');
  return { request_time, request_token };
}

async function postRequest(config: BtConfig, path: string, extraParams: Record<string, string | number> = {}): Promise<unknown> {
  const sig = getSignature(config.apiKey);
  const params = new URLSearchParams({
    request_time: String(sig.request_time),
    request_token: sig.request_token,
    ...Object.fromEntries(Object.entries(extraParams).map(([k, v]) => [k, String(v)])),
  });

  const body = params.toString();
  // 宝塔安全入口（如 /4d33e98c）只用于登录页，API 接口不需要带此前缀
  // 从 panelUrl 中剔除安全入口路径，只保留 协议://主机:端口
  const parsedBase = new URL(config.panelUrl.replace(/\/$/, ''));
  const apiBase = `${parsedBase.protocol}//${parsedBase.host}`;
  const fullUrl = new URL(apiBase + path);
  const isHttps = fullUrl.protocol === 'https:';
  const port = parseInt(fullUrl.port || (isHttps ? '443' : '80'), 10);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: fullUrl.hostname,
      port,
      path: fullUrl.pathname + fullUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      rejectUnauthorized: false,
    };

    const lib = isHttps ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.write(body);
    req.end();
  });
}

function getConfigFromEnv(): BtConfig {
  const panelUrl = process.env.BT_PANEL_URL;
  const apiKey = process.env.BT_API_KEY;
  if (!panelUrl || !apiKey) {
    throw new Error('Missing required environment variables: BT_PANEL_URL and BT_API_KEY');
  }
  return { panelUrl, apiKey };
}

// ── 网站管理 ──────────────────────────────────────────

export interface CreateSiteParams {
  domain: string;
  path: string;
  phpVersion?: string;
  port?: number;
  ps?: string;
  createFtp?: boolean;
  ftpUser?: string;
  ftpPass?: string;
  createDb?: boolean;
  dbUser?: string;
  dbPass?: string;
  dbCharset?: string;
}

export interface DomainInfo {
  id: number;
  pid: number;
  name: string;
  port: number;
  addtime: string;
}

export interface BackupInfo {
  id: number;
  pid: number;
  name: string;
  path: string;
  addtime: string;
}

export async function listSites(search?: string): Promise<SiteInfo[]> {
  const config = getConfigFromEnv();
  const params: Record<string, string | number> = { table: 'sites', limit: 100, p: 1, type: '-1' };
  if (search) params['search'] = search;

  const result = await postRequest(config, '/data?action=getData', params);
  if (Array.isArray(result)) return result as SiteInfo[];
  const obj = result as { data?: SiteInfo[]; sites?: SiteInfo[] };
  return obj?.data || obj?.sites || [];
}

export async function createSite(params: CreateSiteParams): Promise<unknown> {
  const config = getConfigFromEnv();
  const webname = JSON.stringify({ domain: params.domain, domainlist: [], count: 0 });
  return await postRequest(config, '/site?action=AddSite', {
    webname,
    path: params.path,
    type_id: 0,
    type: 'PHP',
    version: params.phpVersion || '74',
    port: params.port || 80,
    ps: params.ps || params.domain,
    ftp: params.createFtp ? 'true' : 'false',
    ...(params.createFtp ? { ftp_username: params.ftpUser || '', ftp_password: params.ftpPass || '' } : {}),
    sql: params.createDb ? 'true' : 'false',
    ...(params.createDb ? { codeing: params.dbCharset || 'utf8mb4', datauser: params.dbUser || '', datapassword: params.dbPass || '' } : {}),
  });
}

export async function deleteSite(id: number, siteName: string, opts: { deleteFtp?: boolean; deleteDb?: boolean; deletePath?: boolean } = {}): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=DeleteSite', {
    id,
    webname: siteName,
    ...(opts.deleteFtp ? { ftp: 1 } : {}),
    ...(opts.deleteDb ? { database: 1 } : {}),
    ...(opts.deletePath ? { path: 1 } : {}),
  });
}

export async function stopSite(id: number, name: string): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=SiteStop', { id, name });
}

export async function startSite(id: number, name: string): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=SiteStart', { id, name });
}

export async function setSiteNote(id: number, ps: string): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/data?action=setPs&table=sites', { id, ps });
}

export async function setSiteExpiry(id: number, edate: string): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=SetEdate', { id, edate });
}

// ── 域名管理 ──────────────────────────────────────────

export async function listDomains(siteId: number): Promise<DomainInfo[]> {
  const config = getConfigFromEnv();
  const result = await postRequest(config, '/data?action=getData&table=domain', { search: siteId, list: 'true' });
  if (Array.isArray(result)) return result as DomainInfo[];
  return [];
}

export async function addDomain(siteId: number, siteName: string, domain: string, port = 80): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=AddDomain', {
    id: siteId,
    webname: siteName,
    domain: port === 80 ? domain : `${domain}:${port}`,
  });
}

export async function deleteDomain(siteId: number, siteName: string, domain: string, port = 80): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=DelDomain', { id: siteId, webname: siteName, domain, port });
}

// ── 备份管理 ──────────────────────────────────────────

export async function listBackups(siteId: number): Promise<BackupInfo[]> {
  const config = getConfigFromEnv();
  const result = await postRequest(config, '/data?action=getData&table=backup', {
    p: 1, limit: 20, type: 0, search: siteId,
  });
  const obj = result as { data?: BackupInfo[] };
  return obj?.data || [];
}

export async function createBackup(siteId: number): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=ToBackup', { id: siteId });
}

export async function deleteBackup(backupId: number): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=DelBackup', { id: backupId });
}

// ── 网站配置 ──────────────────────────────────────────

export async function getNginxConfig(siteName: string): Promise<string> {
  const filePath = `/www/server/panel/vhost/nginx/${siteName}.conf`;
  return await readFile(filePath);
}

export async function saveNginxConfig(siteName: string, content: string): Promise<unknown> {
  const config = getConfigFromEnv();
  const filePath = `/www/server/panel/vhost/nginx/${siteName}.conf`;
  return await postRequest(config, '/files?action=SaveFileBody', {
    path: filePath,
    data: content,
    encoding: 'utf-8',
  });
}

export async function saveFileContent(filePath: string, content: string): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/files?action=SaveFileBody', {
    path: filePath,
    data: content,
    encoding: 'utf-8',
  });
}

export async function getSiteInfo(siteId: number, sitePath: string): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=GetDirUserINI', { id: siteId, path: sitePath });
}

export async function getPhpVersions(): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/site?action=GetPHPVersion', {});
}

export async function checkPanelUpdate(): Promise<unknown> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/ajax?action=UpdatePanel', { check: 'true' });
}

// ── 文件 & 目录操作 ────────────────────────────────────

export interface FileEntry {
  name: string;
  size: number;
  type: string; // 'file' | 'dir'
  time: string;
}

/**
 * 列出目录下的文件列表
 */
export async function listDir(dirPath: string): Promise<FileEntry[]> {
  const config = getConfigFromEnv();
  const result = await postRequest(config, '/files?action=GetDir', { path: dirPath, p: 1, showRow: 100 });
  const obj = result as { data?: FileEntry[]; files?: FileEntry[] };
  if (Array.isArray(result)) return result as FileEntry[];
  return obj?.data || obj?.files || [];
}

export async function readFile(filePath: string): Promise<string> {
  const config = getConfigFromEnv();
  const result = await postRequest(config, '/files?action=GetFileBody', { path: filePath }) as { data?: string; status?: boolean; msg?: string } | string;

  if (typeof result === 'string') return result;
  if (typeof result === 'object' && result !== null) {
    if ('data' in result && typeof result.data === 'string') return result.data;
    if ('status' in result && !result.status) throw new Error(result.msg || 'Failed to read file');
  }
  return String(result);
}

/**
 * 取文件最后 N 行，避免大文件全量读取后 token 爆炸
 */
export function tailLines(content: string, lines: number): string {
  const all = content.split('\n');
  return all.slice(-lines).join('\n');
}

/**
 * 检查文件是否存在（通过尝试读取，捕获错误来判断）
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath);
    // 宝塔在文件不存在时有时返回 HTML 404 页面
    if (typeof content === 'string' && content.includes('<title>404')) return false;
    return true;
  } catch {
    return false;
  }
}

// ── Nginx 日志 ────────────────────────────────────────

/**
 * 宝塔 Nginx 访问日志默认路径：/www/wwwlogs/<siteName>.log
 * 错误日志：/www/wwwlogs/<siteName>.error.log
 */
export async function getNginxAccessLog(siteName: string, lastLines = 200): Promise<string> {
  const path = `/www/wwwlogs/${siteName}.log`;
  const content = await readFile(path);
  return tailLines(content, lastLines);
}

export async function getNginxErrorLog(siteName: string, lastLines = 200): Promise<string> {
  const path = `/www/wwwlogs/${siteName}.error.log`;
  const content = await readFile(path);
  return tailLines(content, lastLines);
}

// ── 应用日志 ──────────────────────────────────────────

export async function getAppLog(logPath: string, lastLines = 200): Promise<string> {
  const content = await readFile(logPath);
  return tailLines(content, lastLines);
}

// ── 面板日志 ──────────────────────────────────────────

export async function getPanelLogs(limit = 30): Promise<unknown> {
  const config = getConfigFromEnv();
  const result = await postRequest(config, '/data?action=getData', {
    table: 'logs',
    limit,
    p: 1,
  }) as { data?: unknown[] };
  return result?.data || [];
}

// ── 系统状态 ──────────────────────────────────────────

export async function getSystemStatus(): Promise<SystemStatus> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/system?action=GetSystemTotal') as SystemStatus;
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  const config = getConfigFromEnv();
  return await postRequest(config, '/system?action=GetNetWork') as NetworkStatus;
}

export async function getDiskInfo(): Promise<DiskInfo[]> {
  const config = getConfigFromEnv();
  const result = await postRequest(config, '/system?action=GetDiskInfo');
  if (Array.isArray(result)) return result as DiskInfo[];
  // 部分宝塔版本返回对象而非数组
  if (result && typeof result === 'object') {
    const arr = Object.values(result as Record<string, unknown>);
    if (arr.every((item) => typeof item === 'object' && item !== null && 'path' in item)) {
      return arr as DiskInfo[];
    }
  }
  return [];
}
