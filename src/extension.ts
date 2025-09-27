import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const provider = new PolycodeViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('polycode.view', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('polycode.openPanel', () => {
      const panel = vscode.window.createWebviewPanel(
        'polycode.panel',
        'Polycode Panel',
        vscode.ViewColumn.Active,
        { enableScripts: true }
      );
      panel.webview.html = getPanelHtml(panel.webview, context);
      hookMessages(panel.webview);
    })
  );
}

export function deactivate() {}

class PolycodeViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getSidebarHtml(webviewView.webview, this.context);
    hookMessages(webviewView.webview);
  }
}

function hookMessages(webview: vscode.Webview) {
  webview.onDidReceiveMessage(msg => {
    if (msg.type === 'click') {
      vscode.window.showInformationMessage(`Button clicked: ${msg.payload}`);
    }
    if (msg.type === 'runCommand') {
      vscode.commands.executeCommand(msg.command);
    }
  });
}

function getSidebarHtml(webview: vscode.Webview, ctx: vscode.ExtensionContext) {
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https:`,
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Polycode</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system; padding: 12px; }
  .btn { padding: 6px 10px; border-radius: 6px; border: 1px solid #888; cursor: pointer; }
  .row { display:flex; gap:8px; margin: 8px 0; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
  .title { font-weight: 600; margin-bottom: 6px; }
</style>
</head>
<body>
  <div class="card">
    <div class="title">Polycode Sidebar</div>
    <div class="row">
      <button class="btn" id="hello">Say Hello</button>
      <button class="btn" id="openPanel">Open Panel</button>
    </div>
    <div class="row">
      <button class="btn" id="runFormat">Run: Format Document</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('hello')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'click', payload: 'Hello from Sidebar' });
    });
    document.getElementById('openPanel')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'runCommand', command: 'polycode.openPanel' });
    });
    document.getElementById('runFormat')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'runCommand', command: 'editor.action.formatDocument' });
    });
  </script>
</body>
</html>`;
}

function getPanelHtml(webview: vscode.Webview, ctx: vscode.ExtensionContext) {
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https:`,
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Polycode Panel</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system; padding: 16px; }
  h1 { margin: 0 0 12px; }
  .btn { padding: 8px 12px; border-radius: 8px; border: 1px solid #888; cursor: pointer; }
  .row { display:flex; gap:10px; margin: 10px 0; }
  .log { margin-top: 12px; font-size: 12px; color: #666; }
</style>
</head>
<body>
  <h1>Polycode Panel</h1>
  <div class="row">
    <button class="btn" id="ping">Ping Extension</button>
    <button class="btn" id="format">Format Document</button>
  </div>
  <div class="log" id="log">Ready.</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const log = (t) => document.getElementById('log').textContent = t;

    document.getElementById('ping')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'click', payload: 'Ping from Panel' });
      log('Sent ping to extension.');
    });
    document.getElementById('format')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'runCommand', command: 'editor.action.formatDocument' });
      log('Requested: editor.action.formatDocument');
    });
  </script>
</body>
</html>`;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
