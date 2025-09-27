import * as vscode from "vscode";
import { P2PUser } from "./p2pUser";

export function activate(context: vscode.ExtensionContext) {
  console.log("Polycode extension activated!");

  // Initialize P2P User for real-time collaboration
  const p2pUser = new P2PUser();
  context.subscriptions.push({
    dispose: async () => {
      await p2pUser.stop();
    }
  });

  // Start P2P networking
  p2pUser.start().catch(console.error);

  // Sidebar provider
  const provider = new PolycodeViewProvider(context, p2pUser);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("polycode.view", provider)
  );

  // Listen for text document changes to create CRDT updates for ALL files
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      // Send changes for any file in the workspace to enable synchronous collaboration
      console.log(
        "Text document changed in file:",
        event.document.uri.fsPath,
        "contentChanges:",
        event.contentChanges.length
      );
      console.log("Content changes:", event.contentChanges);
      
      const crdtUpdate = createCRDTUpdate(event);
      console.log("CRDT Update:", JSON.stringify(crdtUpdate, null, 2));

      // Send CRDT update to webview
      provider.sendCRDTUpdate(crdtUpdate);

      // Broadcast CRDT update to P2P network for synchronous collaboration
      p2pUser.broadcastCRDTUpdate(crdtUpdate).catch(console.error);
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
      hookMessages(panel.webview, provider, p2pUser);
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

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly p2pUser: P2PUser
  ) {}

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
    hookMessages(webviewView.webview, this, this.p2pUser);
  }

  sendCRDTUpdate(crdtUpdate: any) {
    if (this.webview) {
      this.webview.postMessage({
        type: "crdtUpdate",
        update: crdtUpdate,
      });
    }
  }
}

function hookMessages(
  webview: vscode.Webview,
  provider?: PolycodeViewProvider,
  p2pUser?: P2PUser
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
    if (msg?.type === "applyCRDTUpdates" && msg.updates) {
      console.log("Applying CRDT updates from P2P network");
      applyCRDTUpdatesToFile(msg.updates);
    }
    if (msg?.type === "saveToGitHub" && p2pUser) {
      const commitMessage = msg.commitMessage || "Auto-save from Polycode";
      console.log("Saving to GitHub with message:", commitMessage);
      p2pUser.saveToGitHub(commitMessage).then(success => {
        if (success) {
          webview.postMessage({
            type: "githubSaveResult",
            success: true,
            message: "Successfully saved to GitHub"
          });
        } else {
          webview.postMessage({
            type: "githubSaveResult",
            success: false,
            message: "Failed to save to GitHub"
          });
        }
      });
    }
    if (msg?.type === "syncFromGitHub" && p2pUser) {
      console.log("Syncing from GitHub");
      p2pUser.syncFromGitHub().then(success => {
        if (success) {
          webview.postMessage({
            type: "githubSyncResult",
            success: true,
            message: "Successfully synced from GitHub"
          });
        } else {
          webview.postMessage({
            type: "githubSyncResult",
            success: false,
            message: "Failed to sync from GitHub"
          });
        }
      });
    }
    if (msg?.type === "getP2PStatus" && p2pUser) {
      webview.postMessage({
        type: "p2pStatus",
        isConnected: p2pUser.isConnected(),
        peerCount: p2pUser.getPeerCount(),
        peerId: p2pUser.getPeerId()
      });
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

async function applyCRDTUpdatesToFile(updates: any[]) {
  try {
    // Extract the document URI from the first update (all updates should be for the same file)
    if (!updates || updates.length === 0) {
      console.error("No updates provided to applyCRDTUpdatesToFile");
      return;
    }

    const documentUri = updates[0].document;
    if (!documentUri) {
      console.error("No document URI found in CRDT updates");
      return;
    }

    // Parse the document URI
    const targetUri = vscode.Uri.parse(documentUri);

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
      `Applied ${updates.length} CRDT updates to ${targetUri.fsPath}`
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
