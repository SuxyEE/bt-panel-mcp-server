import { z } from 'zod';
import {
  BT_OFFICIAL_API_CATALOG_VERSION,
  BT_OFFICIAL_API_OPERATION_BY_ID,
  BT_OFFICIAL_API_OPERATIONS,
  type BtApiOperation,
} from '../api-catalog.generated.js';
import { callBtApi } from '../bt-client.js';

const paramsSchema = z.record(z.unknown());

export const searchOfficialApiSchema = z.object({
  query: z.string().trim().optional().describe('按操作 ID、名称或说明搜索；不填则列出目录'),
  module: z.string().trim().optional().describe('按模块筛选，例如 site、database、docker、ssl'),
  include_parameters: z.boolean().default(false).describe('是否在搜索结果中展开参数定义'),
  limit: z.number().int().min(1).max(100).default(30).describe('最多返回的操作数，默认 30'),
});

export const getOfficialApiOperationSchema = z.object({
  operation: z.string().min(1).describe('官方操作 ID，例如 site/AddSite 或 docker/get_list'),
});

export const callOfficialApiSchema = z.object({
  operation: z.string().min(1).describe('从 search_bt_api 或 get_bt_api_operation 获得的官方操作 ID'),
  params: paramsSchema.default({}).describe('接口参数对象；API 密钥和签名参数由服务端自动注入'),
});

export type SearchOfficialApiInput = z.infer<typeof searchOfficialApiSchema>;
export type GetOfficialApiOperationInput = z.infer<typeof getOfficialApiOperationSchema>;
export type CallOfficialApiInput = z.infer<typeof callOfficialApiSchema>;

function moduleOf(operation: BtApiOperation): string {
  return operation.id.split('/', 1)[0] ?? '';
}

function operationSummary(operation: BtApiOperation, includeParameters: boolean) {
  const summary: Record<string, unknown> = {
    operation: operation.id,
    title: operation.title,
    description: operation.description,
    method: operation.method,
    path: operation.path,
    ...(operation.action ? { action: operation.action } : {}),
    required_params: operation.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name),
  };
  if (includeParameters) summary.parameters = operation.parameters;
  return summary;
}

function getOperation(operationId: string): BtApiOperation {
  const operation = BT_OFFICIAL_API_OPERATION_BY_ID.get(operationId);
  if (!operation) {
    throw new Error(`Unknown official BT API operation: ${operationId}. Use search_bt_api to find a valid operation ID.`);
  }
  return operation;
}

export async function handleSearchOfficialApi(input: SearchOfficialApiInput): Promise<string> {
  const query = input.query?.toLocaleLowerCase() ?? '';
  const module = input.module?.toLocaleLowerCase();
  const matches = BT_OFFICIAL_API_OPERATIONS.filter((operation) => {
    if (module && moduleOf(operation).toLocaleLowerCase() !== module) return false;
    if (!query) return true;
    return [operation.id, operation.title, operation.description, operation.path, operation.action ?? '']
      .join(' ')
      .toLocaleLowerCase()
      .includes(query);
  });

  const moduleCounts = new Map<string, number>();
  for (const operation of BT_OFFICIAL_API_OPERATIONS) {
    const moduleName = moduleOf(operation);
    moduleCounts.set(moduleName, (moduleCounts.get(moduleName) ?? 0) + 1);
  }

  return JSON.stringify({
    catalog_version: BT_OFFICIAL_API_CATALOG_VERSION,
    total_operations: BT_OFFICIAL_API_OPERATIONS.length,
    matching_operations: matches.length,
    modules: Object.fromEntries([...moduleCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    operations: matches.slice(0, input.limit).map((operation) => operationSummary(operation, input.include_parameters)),
    ...(matches.length > input.limit ? { truncated: true } : {}),
  }, null, 2);
}

export async function handleGetOfficialApiOperation(input: GetOfficialApiOperationInput): Promise<string> {
  const operation = getOperation(input.operation);
  return JSON.stringify({
    catalog_version: BT_OFFICIAL_API_CATALOG_VERSION,
    ...operationSummary(operation, true),
  }, null, 2);
}

export async function handleCallOfficialApi(input: CallOfficialApiInput): Promise<string> {
  const operation = getOperation(input.operation);
  const reservedKeys = ['action', 'request_time', 'request_token'];
  const suppliedReservedKeys = reservedKeys.filter((key) => Object.hasOwn(input.params, key));
  if (suppliedReservedKeys.length) {
    throw new Error(`Do not pass reserved parameter(s): ${suppliedReservedKeys.join(', ')}. They are set by the server.`);
  }

  const missing = operation.parameters
    .filter((parameter) => parameter.required && input.params[parameter.name] === undefined)
    .map((parameter) => parameter.name);
  if (missing.length) {
    throw new Error(`Missing required parameter(s) for ${operation.id}: ${missing.join(', ')}`);
  }

  const result = await callBtApi(operation.method, operation.path, {
    ...input.params,
    ...(operation.action ? { action: operation.action } : {}),
  });

  // Do not echo input parameters because several official operations accept passwords and API secrets.
  return JSON.stringify({
    operation: operation.id,
    method: operation.method,
    path: operation.path,
    result,
  }, null, 2);
}
