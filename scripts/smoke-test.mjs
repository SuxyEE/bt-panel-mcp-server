import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BT_OFFICIAL_API_OPERATIONS } from '../dist/api-catalog.generated.js';
import { callBtApi } from '../dist/bt-client.js';

const ACTION_ROUTES = new Set([
  '/acme', '/crontab', '/data', '/database', '/deployment', '/files', '/ftp', '/password',
  '/push', '/site', '/ssh_security', '/ssl', '/system', '/task', '/warning', '/xterm',
]);

function assertCatalog() {
  assert.equal(BT_OFFICIAL_API_OPERATIONS.length, 369);
  assert.equal(new Set(BT_OFFICIAL_API_OPERATIONS.map((operation) => operation.id)).size, 369);
  for (const operation of BT_OFFICIAL_API_OPERATIONS) {
    assert.match(operation.path, /^\//);
    assert.ok(!operation.path.includes('<'));
    assert.ok(['GET', 'POST'].includes(operation.method));
    if (ACTION_ROUTES.has(operation.path)) assert.match(operation.action ?? '', /^[A-Za-z_][A-Za-z0-9_]*$/);
  }

  const requiredOperations = [
    'files/MvFile',
    'files/CreateDir',
    'files/DeleteFile',
    'push/get_push_logs',
    'task/get_task_find',
    'xterm/set_completion_tool_status',
    'xterm/set_terminal_theme',
    'xterm/set_ai_shell_status',
    'xterm/set_ai_shell_analyze',
  ];
  for (const operationId of requiredOperations) {
    assert.ok(BT_OFFICIAL_API_OPERATIONS.some((operation) => operation.id === operationId));
  }
}

function startMockPanel() {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, body });
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port }));
  });
}

function textResult(result) {
  const content = result.content?.find((item) => item.type === 'text');
  assert.ok(content && content.type === 'text');
  return content.text;
}

async function connectClient(mode, panelUrl) {
  const client = new Client({ name: 'bt-panel-mcp-smoke-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    env: { ...process.env, BT_PANEL_URL: panelUrl, BT_API_KEY: 'test-api-key', BT_MODE: mode },
  });
  await client.connect(transport);
  return client;
}

async function main() {
  assertCatalog();
  const mock = await startMockPanel();
  const panelUrl = `http://127.0.0.1:${mock.port}/security-entry`;

  try {
    process.env.BT_PANEL_URL = panelUrl;
    process.env.BT_API_KEY = 'test-api-key';
    await callBtApi('POST', '/site', { action: 'AddSite', payload: ['a', 'b'] });
    await callBtApi('GET', '/btdocker/container/get_list', { page: 1 });

    const fullClient = await connectClient('full', panelUrl);
    try {
      const toolList = await fullClient.listTools();
      assert.equal(toolList.tools.length, 17);
      assert.ok(toolList.tools.some((tool) => tool.name === 'call_bt_api'));

      const definition = JSON.parse(textResult(await fullClient.callTool({
        name: 'get_bt_api_operation',
        arguments: { operation: 'files/MvFile' },
      })));
      assert.equal(definition.action, 'MvFile');
      assert.ok(definition.parameters.some((parameter) => parameter.name === 'sfile' && parameter.required));
      assert.ok(definition.parameters.some((parameter) => parameter.name === 'dfile' && parameter.required));

      const invocation = JSON.parse(textResult(await fullClient.callTool({
        name: 'call_bt_api',
        arguments: { operation: 'files/MvFile', params: { sfile: '/source', dfile: '/target' } },
      })));
      assert.equal(invocation.operation, 'files/MvFile');
      assert.deepEqual(invocation.result, { ok: true });
    } finally {
      await fullClient.close();
    }

    const readonlyClient = await connectClient('readonly', panelUrl);
    try {
      const toolList = await readonlyClient.listTools();
      assert.equal(toolList.tools.length, 11);
      assert.ok(toolList.tools.some((tool) => tool.name === 'search_bt_api'));
      assert.ok(!toolList.tools.some((tool) => tool.name === 'call_bt_api'));
    } finally {
      await readonlyClient.close();
    }

    assert.equal(mock.requests.length, 3);
    assert.equal(mock.requests[0].method, 'POST');
    assert.match(mock.requests[0].body, /request_time=/);
    assert.match(mock.requests[0].body, /request_token=/);
    assert.match(mock.requests[0].body, /payload=%5B%22a%22%2C%22b%22%5D/);
    assert.equal(mock.requests[1].method, 'GET');
    assert.match(mock.requests[1].url, /page=1/);
    assert.match(mock.requests[1].url, /request_token=/);
    assert.equal(mock.requests[2].method, 'POST');
    assert.match(mock.requests[2].body, /action=MvFile/);
    assert.match(mock.requests[2].body, /sfile=%2Fsource/);
    assert.match(mock.requests[2].body, /dfile=%2Ftarget/);
  } finally {
    await new Promise((resolve) => mock.server.close(resolve));
  }
}

await main();
process.stdout.write('Smoke tests passed.\n');
