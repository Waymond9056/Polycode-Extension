import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  // Sidebar provider
  const provider = new PolycodeViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("polycode.view", provider)
  );

  // Command to open a full panel
  context.subscriptions.push(
    vscode.commands.registerCommand("polycode.openPanel", () => {
      const panel = vscode.window.createWebviewPanel(
        "polycode.panel",
        "Polycode Panel",
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, "media", "dist"),
          ],
        }
      );
      panel.webview.html = getWebviewHtml(panel.webview, context, "panel");
      hookMessages(panel.webview);
    })
  );

  // Keep helloWorld example
  context.subscriptions.push(
    vscode.commands.registerCommand("polycode.helloWorld", () =>
      vscode.window.showInformationMessage("Hello World from Polycode!")
    )
  );
}

export function deactivate() {}

class PolycodeViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media", "dist"),
      ],
    };
    webviewView.webview.html = getWebviewHtml(
      webviewView.webview,
      this.context,
      "sidebar"
    );
    hookMessages(webviewView.webview);
  }
}

function hookMessages(webview: vscode.Webview) {
  webview.onDidReceiveMessage((msg) => {
    if (msg?.type === "toast") {
      vscode.window.showInformationMessage(String(msg.text ?? ""));
    }
    if (msg?.type === "runCommand" && typeof msg.command === "string") {
      vscode.commands.executeCommand(msg.command);
    }
  });
}

function getWebviewHtml(
  webview: vscode.Webview,
  ctx: vscode.ExtensionContext,
  flavor: "sidebar" | "panel"
) {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(ctx.extensionUri, "media", "dist", "main.js")
  );
  const nonce = getNonce();

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https:`,
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Polycode ${flavor === "sidebar" ? "Sidebar" : "Panel"}</title>
</head>
<body>
  <div id="root" data-flavor="${flavor}"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
