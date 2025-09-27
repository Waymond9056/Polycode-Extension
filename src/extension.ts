import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("Polycode extension activated!");

  // Sidebar provider
  const provider = new PolycodeViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("polycode.view", provider)
  );

  // Listen for text document changes to create CRDT updates
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        // Only generate CRDT updates for the source file, not the target file
        const currentFilePath = event.document.uri.fsPath;
        const targetFilePath = provider.getTargetFilePath();

        if (targetFilePath && currentFilePath.endsWith(targetFilePath)) {
          console.log("Skipping CRDT update for target file:", currentFilePath);
          return;
        }

        console.log(
          "Text document changed, contentChanges:",
          event.contentChanges.length
        );
        console.log("Content changes:", event.contentChanges);
        const crdtUpdate = createCRDTUpdate(event);
        console.log("CRDT Update:", JSON.stringify(crdtUpdate, null, 2));

        // Send CRDT update to webview
        provider.sendCRDTUpdate(crdtUpdate);
      }
    })
  );

  // Command to open a full panel
  context.subscriptions.push(
    vscode.commands.registerCommand("polycode.openPanel", () => {
      console.log("Setting up panel webview");
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
      hookMessages(panel.webview, provider);
    })
  );

  // Keep helloWorld example
  context.subscriptions.push(
    vscode.commands.registerCommand("polycode.helloWorld", () => {
      console.log("Hello World command executed!");
      vscode.window.showInformationMessage("Hello World from Polycode!");
    })
  );
}

export function deactivate() {}

class PolycodeViewProvider implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;
  private targetFilePath?: string;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    console.log("Setting up sidebar webview");
    this.webview = webviewView.webview;

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
    hookMessages(webviewView.webview, this);
  }

  sendCRDTUpdate(crdtUpdate: any) {
    if (this.webview) {
      this.webview.postMessage({
        type: "crdtUpdate",
        update: crdtUpdate,
      });
    }
  }

  setTargetFilePath(targetFilePath: string) {
    this.targetFilePath = targetFilePath;
  }

  getTargetFilePath(): string | undefined {
    return this.targetFilePath;
  }
}

function hookMessages(
  webview: vscode.Webview,
  provider?: PolycodeViewProvider
) {
  console.log("Setting up message handler for webview");
  console.log("Webview instance:", webview);
  webview.onDidReceiveMessage((msg) => {
    console.log("Extension received message:", msg);
    console.log("Message type:", msg?.type);

    if (msg?.type === "toast") {
      vscode.window.showInformationMessage(String(msg.text ?? ""));
    }
    if (msg?.type === "runCommand" && typeof msg.command === "string") {
      vscode.commands.executeCommand(msg.command);
    }
    if (msg?.type === "testConnection") {
      console.log("Test connection received");
      webview.postMessage({
        type: "testResponse",
        data: "Extension is working!",
      });
    }
    if (msg?.type === "getEditorContent") {
      console.log("Handling getEditorContent request");
      // Send current editor content to webview
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const content = editor.document.getText();
        console.log(
          "Sending editor content to webview, length:",
          content.length
        );
        webview.postMessage({
          type: "editorContent",
          content: content,
        });
      } else {
        console.log("No active editor found");
        webview.postMessage({
          type: "editorContent",
          content: "No active editor",
        });
      }
    }
    if (msg?.type === "insertText" && typeof msg.text === "string") {
      console.log("Handling insertText request:", msg.text);

      // Insert text at the current cursor position
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const position = editor.selection.active;

        editor
          .edit((editBuilder) => {
            editBuilder.insert(position, msg.text);
          })
          .then((success) => {
            if (success) {
              console.log("Text inserted successfully at cursor position");
            } else {
              console.log("Failed to insert text");
            }
          });
      } else {
        console.log("No active editor found");
      }
    }
    if (msg?.type === "applyCRDTUpdates" && msg.targetFile && msg.updates) {
      console.log("Applying CRDT updates to:", msg.targetFile);
      // Store the target file path to prevent CRDT updates from being generated for it
      if (provider) {
        provider.setTargetFilePath(msg.targetFile);
      }
      applyCRDTUpdatesToFile(msg.targetFile, msg.updates);
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

function createCRDTUpdate(event: vscode.TextDocumentChangeEvent) {
  const timestamp = Date.now();
  const updates = event.contentChanges.map((change, index) => {
    const update: any = {
      id: `${timestamp}-${index}`,
      timestamp,
      type: "text_change",
      position: {
        line: change.range.start.line,
        character: change.range.start.character,
      },
      range: {
        start: {
          line: change.range.start.line,
          character: change.range.start.character,
        },
        end: {
          line: change.range.end.line,
          character: change.range.end.character,
        },
      },
    };

    if (change.text) {
      // Insert operation
      update.operation = "insert";
      update.text = change.text;
    } else if (change.rangeLength > 0) {
      // Delete operation
      update.operation = "delete";
      update.length = change.rangeLength;
    }

    return update;
  });

  return {
    document: event.document.uri.toString(),
    timestamp,
    updates,
  };
}

async function applyCRDTUpdatesToFile(targetFilePath: string, updates: any[]) {
  try {
    // Handle relative paths by resolving them relative to the workspace
    let targetUri: vscode.Uri;
    if (targetFilePath.startsWith("/")) {
      // Absolute path
      targetUri = vscode.Uri.file(targetFilePath);
    } else {
      // Relative path - resolve relative to workspace root
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        targetUri = vscode.Uri.joinPath(workspaceFolder.uri, targetFilePath);
      } else {
        // Fallback to current working directory
        targetUri = vscode.Uri.file(targetFilePath);
      }
    }

    // Check if file exists, create if it doesn't
    let targetDocument: vscode.TextDocument;
    try {
      targetDocument = await vscode.workspace.openTextDocument(targetUri);
    } catch (error) {
      // File doesn't exist, create it
      await vscode.workspace.fs.writeFile(targetUri, Buffer.from(""));
      targetDocument = await vscode.workspace.openTextDocument(targetUri);
    }

    // Open the target file in an editor
    const editor = await vscode.window.showTextDocument(targetDocument);

    // Apply all updates in chronological order
    for (const update of updates) {
      for (const operation of update.updates) {
        await applyCRDTOperation(editor, operation);
      }
    }

    vscode.window.showInformationMessage(
      `Applied ${updates.length} CRDT updates to ${targetFilePath}`
    );
  } catch (error) {
    console.error("Error applying CRDT updates:", error);
    vscode.window.showErrorMessage(`Failed to apply CRDT updates: ${error}`);
  }
}

async function applyCRDTOperation(editor: vscode.TextEditor, operation: any) {
  return new Promise<void>((resolve) => {
    const position = new vscode.Position(
      operation.position.line,
      operation.position.character
    );

    editor
      .edit((editBuilder) => {
        if (operation.operation === "insert" && operation.text) {
          editBuilder.insert(position, operation.text);
        } else if (operation.operation === "delete" && operation.length) {
          const endPosition = new vscode.Position(
            operation.range.end.line,
            operation.range.end.character
          );
          const range = new vscode.Range(position, endPosition);
          editBuilder.delete(range);
        }
      })
      .then(() => {
        resolve();
      });
  });
}
