#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const docsDir = process.env.BT_OFFICIAL_DOCS_DIR;
if (!docsDir) {
  throw new Error('Set BT_OFFICIAL_DOCS_DIR to a checkout of cnb.cool/btpanel/docs.');
}

const apiRoot = path.join(docsDir, 'docs', 'api');
const outputPath = path.resolve('src/api-catalog.generated.ts');

async function listMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
  }));
  return nested.flat();
}

function tableCells(line) {
  if (!line.startsWith('|')) return undefined;
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function parseParameterTable(markdown) {
  const inputStart = markdown.search(/^##\s+输入参数\s*$/m);
  if (inputStart === -1) return [];

  const afterHeading = markdown.slice(inputStart).replace(/^##[^\r\n]*(?:\r?\n|$)/, '');
  const nextHeading = afterHeading.search(/^##\s+/m);
  const section = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
  return section.split(/\r?\n/).flatMap((line) => {
    const cells = tableCells(line);
    if (!cells || cells.length < 4 || cells[0] === 'action' || cells[0] === '参数名称' || /^-+$/.test(cells[0])) {
      return [];
    }
    return [{
      name: cells[0],
      required: cells[1] === '是',
      type: cells[2],
      description: cells.slice(3).join(' | '),
    }];
  });
}

function parseParameters(lines, actionRow) {
  let start = actionRow;
  while (start > 0 && lines[start - 1].startsWith('|')) start -= 1;
  let end = actionRow;
  while (end + 1 < lines.length && lines[end + 1].startsWith('|')) end += 1;

  return lines.slice(start, end + 1).flatMap((line) => {
    const cells = tableCells(line);
    if (!cells || cells.length < 4 || cells[0] === 'action' || cells[0] === '参数名称' || /^-+$/.test(cells[0])) {
      return [];
    }
    return [{
      name: cells[0],
      required: cells[1] === '是',
      type: cells[2],
      description: cells.slice(3).join(' | '),
    }];
  });
}

function parseActionDefinitions(markdown) {
  const lines = markdown.split(/\r?\n/);
  const definitions = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const cells = tableCells(lines[index]);
    if (!cells || cells.length < 4 || cells[0].toLowerCase() !== 'action') continue;

    const parameters = parseParameters(lines, index);
    for (const match of cells[3].matchAll(/`([^`]+)`/g)) {
      const action = match[1].trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(action)) continue;
      const existing = definitions.get(action);
      if (!existing || parameters.length > existing.length) definitions.set(action, parameters);
    }
  }
  return definitions;
}

const actionRoutes = new Set([
  '/acme', '/crontab', '/data', '/database', '/deployment', '/files', '/ftp', '/password',
  '/push', '/site', '/ssh_security', '/ssl', '/system', '/task', '/warning', '/xterm',
]);

function operationId(relativePath, action) {
  const normalizedPath = relativePath.replace(/\\/g, '/').replace(/\.md$/, '');
  const pageAction = path.basename(normalizedPath);
  return action === pageAction ? normalizedPath : `${normalizedPath.split('/', 1)[0]}/${action}`;
}

function parseOperations(markdown, relativePath) {
  const routeMatch = markdown.match(/路由\*\*[：:]\s*`([^`]+)`/);
  if (!routeMatch) return [];

  const requestMatch = routeMatch[1].trim().match(/^(GET|POST)\s+([^\s]+)$/);
  if (!requestMatch) return [];

  const [, method, requestPath] = requestMatch;
  if (requestPath.includes('<')) return [];

  const actionMatch = markdown.match(/action\*\*[：:]\s*`([^`]+)`/);
  const title = markdown.match(/^title:\s*(.+)$/m)?.[1].trim() ?? path.basename(relativePath, '.md');
  const description = markdown.match(/^description:\s*(.+)$/m)?.[1].trim() ?? '';
  if (!actionRoutes.has(requestPath)) {
    return [{
      id: relativePath.replace(/\\/g, '/').replace(/\.md$/, ''),
      title,
      description,
      method,
      path: requestPath,
      parameters: parseParameterTable(markdown),
    }];
  }

  const actions = parseActionDefinitions(markdown);
  const fallbackAction = actionMatch?.[1].trim() ?? path.basename(relativePath, '.md');
  if (actions.size === 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(fallbackAction)) {
    actions.set(fallbackAction, parseParameterTable(markdown));
  }

  return [...actions.entries()].map(([action, parameters]) => ({
    id: operationId(relativePath, action),
    title: action === path.basename(relativePath, '.md') ? title : action,
    description,
    method,
    path: requestPath,
    action,
    parameters,
  }));
}

const files = await listMarkdownFiles(apiRoot);
const operations = [];
const skipped = [];
for (const file of files) {
  const relativePath = path.relative(apiRoot, file);
  if (path.basename(relativePath) === 'index.md') continue;
  const markdown = await fs.readFile(file, 'utf8');
  const parsedOperations = parseOperations(markdown, relativePath);
  if (parsedOperations.length) operations.push(...parsedOperations);
  else skipped.push(relativePath.replace(/\\/g, '/'));
}

const operationsById = new Map();
for (const operation of operations) {
  const existing = operationsById.get(operation.id);
  if (!existing) {
    operationsById.set(operation.id, operation);
    continue;
  }
  if (existing.method !== operation.method || existing.path !== operation.path || existing.action !== operation.action) {
    throw new Error(`Conflicting catalog definition for ${operation.id}`);
  }
  if (operation.parameters.length > existing.parameters.length) operationsById.set(operation.id, operation);
}
const uniqueOperations = [...operationsById.values()].sort((left, right) => left.id.localeCompare(right.id));

const sourceRevision = process.env.BT_OFFICIAL_DOCS_REVISION ?? 'unknown';
const generatedAt = new Date().toISOString();
const banner = [
  '// This file is generated by scripts/generate-api-catalog.mjs.',
  `// Source: cnb.cool/btpanel/docs @ ${sourceRevision}; generated ${generatedAt}.`,
  `// Included ${uniqueOperations.length} executable operations; skipped ${skipped.length} non-operation pages.`,
  '',
].join('\n');

const source = `${banner}export interface BtApiParameter {
  name: string;
  required: boolean;
  type: string;
  description: string;
}

export interface BtApiOperation {
  id: string;
  title: string;
  description: string;
  method: 'GET' | 'POST';
  path: string;
  action?: string;
  parameters: BtApiParameter[];
}

export const BT_OFFICIAL_API_CATALOG_VERSION = ${JSON.stringify(sourceRevision)};

export const BT_OFFICIAL_API_OPERATIONS: readonly BtApiOperation[] = ${JSON.stringify(uniqueOperations, null, 2)};

export const BT_OFFICIAL_API_OPERATION_BY_ID = new Map(
  BT_OFFICIAL_API_OPERATIONS.map((operation) => [operation.id, operation] as const),
);
`;

await fs.writeFile(outputPath, source, 'utf8');
process.stdout.write(`Generated ${uniqueOperations.length} operations at ${outputPath}; skipped ${skipped.length} pages.\n`);
