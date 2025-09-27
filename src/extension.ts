import * as vscode from "vscode";
import { P2PUser } from "./p2pUser";
import { randomBytes } from "crypto";

// Generate a unique client ID for this instance
const CLIENT_ID = randomBytes(8).toString("hex");

// Flag to prevent infinite loops when applying CRDT updates from P2P
let isApplyingCRDTUpdate = false;

export function activate(context: vscode.ExtensionContext) {
  console.log("Polycode extension activated with client ID:", CLIENT_ID);

  // Initialize P2P User for real-time collaboration
  // Both users can now send and receive messages bidirectionally
  const p2pUser = new P2PUser("polycode", CLIENT_ID, applyCRDTUpdatesToFile);
  context.subscriptions.push({
    dispose: async () => {
      await p2pUser.stop();
    },
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
      // Skip if we're currently applying a CRDT update to prevent infinite loops
      if (isApplyingCRDTUpdate) {
        console.log(
          "Skipping document change event - currently applying CRDT update"
        );
        return;
      }

      // Only process events with actual content changes
      if (event.contentChanges.length === 0) {
        console.log("Skipping document change event with no content changes");
        return;
      }

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
    if (msg?.type === "setUserName" && typeof msg.userName === "string") {
      // Store the user name and broadcast it to peers
      if (p2pUser) {
        p2pUser.setUserName(msg.userName);
        p2pUser.broadcastMessage({
          type: "userNameUpdate",
          userName: msg.userName,
          clientId: p2pUser.getClientId(),
          timestamp: Date.now(),
        });
      }
    }
    if (msg?.type === "executeShell" && typeof msg.script === "string") {
      const { exec } = require("child_process");
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const fullScript = `cd "${workspaceRoot}" && ${msg.script}`;
      console.log(`Executing: ${fullScript}`);

      exec(fullScript, (error: any, stdout: string, stderr: string) => {
        if (error) {
          console.error(`Error executing shell command: ${error}`);
          vscode.window.showErrorMessage(`Error: ${error.message}`);
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
        }
        console.log(`stdout: ${stdout}`);
        vscode.window.showInformationMessage(
          `Shell command executed successfully`
        );

        // If this was a save command, notify other peers to sync
        if (msg.script.includes("git checkout -b Saving") && p2pUser) {
          console.log("Save completed, notifying peers to sync...");
          p2pUser.broadcastMessage({
            type: "syncRequest",
            message: "Please sync your workspace",
            timestamp: Date.now(),
          });
        }
      });
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
      p2pUser.saveToGitHub(commitMessage).then((success) => {
        if (success) {
          webview.postMessage({
            type: "githubSaveResult",
            success: true,
            message: "Successfully saved to GitHub",
          });
        } else {
          webview.postMessage({
            type: "githubSaveResult",
            success: false,
            message: "Failed to save to GitHub",
          });
        }
      });
    }
    if (msg?.type === "syncFromGitHub" && p2pUser) {
      console.log("Syncing from GitHub");
      p2pUser.syncFromGitHub().then((success) => {
        if (success) {
          webview.postMessage({
            type: "githubSyncResult",
            success: true,
            message: "Successfully synced from GitHub",
          });
        } else {
          webview.postMessage({
            type: "githubSyncResult",
            success: false,
            message: "Failed to sync from GitHub",
          });
        }
      });
    }
    if (msg?.type === "getP2PStatus" && p2pUser) {
      // Send a ping to help identify peers
      p2pUser.identifyPeers().catch(console.error);

      webview.postMessage({
        type: "p2pStatus",
        isConnected: p2pUser.isConnected(),
        peerCount: p2pUser.getPeerCount(),
        peerId: p2pUser.getPeerId(),
        clientId: p2pUser.getClientId(),
        peers: p2pUser.getConnectedPeers(),
      });
    }
    if (msg?.type === "pingPeers" && p2pUser) {
      console.log("Pinging peers with message:", msg.message);
      p2pUser.pingPeers(msg.message || "Test ping").catch(console.error);
    }
    if (msg?.type === "sendTestMessage" && p2pUser) {
      console.log("Sending test message:", msg.message);
      p2pUser.sendTestMessage(msg.message || "I LOVE YOU").catch(console.error);
    }
    if (msg?.type === "sendResponseMessage" && p2pUser) {
      console.log("Sending response message:", msg.message);
      p2pUser
        .sendResponseMessage(msg.message || "I LOVE YOU TOO")
        .catch(console.error);
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

  // Convert absolute path to relative path for cross-computer syncing
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  let documentPath = event.document.uri.toString();

  if (workspaceFolder) {
    const workspaceUri = workspaceFolder.uri.toString();
    if (documentPath.startsWith(workspaceUri)) {
      // Convert to relative path
      const relativePath = documentPath.substring(workspaceUri.length + 1); // +1 to remove leading slash
      documentPath = relativePath;
    }
  }

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
    document: documentPath, // Use relative path instead of absolute URI
    timestamp,
    updates,
    clientId: CLIENT_ID, // Add client ID to identify the source
  };
}

async function applyCRDTUpdatesToFile(updates: any[]) {
  try {
    // Set flag to prevent infinite loops
    isApplyingCRDTUpdate = true;

    // Extract the document URI from the first update (all updates should be for the same file)
    if (!updates || updates.length === 0) {
      console.error("No updates provided to applyCRDTUpdatesToFile");
      isApplyingCRDTUpdate = false;
      return;
    }

    // Filter out updates that originated from this client to prevent feedback loops
    const filteredUpdates = updates.filter((update) => {
      if (update.clientId === CLIENT_ID) {
        console.log("Skipping CRDT update from same client:", update.clientId);
        return false;
      }
      return true;
    });

    if (filteredUpdates.length === 0) {
      console.log("All CRDT updates filtered out (from same client)");
      isApplyingCRDTUpdate = false;
      return;
    }

    const documentPath = filteredUpdates[0].document;
    if (!documentPath) {
      console.error("No document path found in CRDT updates");
      isApplyingCRDTUpdate = false;
      return;
    }

    // Resolve relative path to absolute URI
    let targetUri: vscode.Uri;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (documentPath.startsWith("file://")) {
      // Already an absolute URI
      targetUri = vscode.Uri.parse(documentPath);
    } else {
      // Relative path - resolve against workspace root
      if (workspaceFolder) {
        targetUri = vscode.Uri.joinPath(workspaceFolder.uri, documentPath);
      } else {
        // Fallback to current working directory
        targetUri = vscode.Uri.file(documentPath);
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
    for (const update of filteredUpdates) {
      for (const operation of update.updates) {
        await applyCRDTOperation(editor, operation);
      }
    }

    vscode.window.showInformationMessage(
      `Applied ${filteredUpdates.length} CRDT updates to ${targetUri.fsPath}`
    );
  } catch (error) {
    console.error("Error applying CRDT updates:", error);
    vscode.window.showErrorMessage(`Failed to apply CRDT updates: ${error}`);
  } finally {
    // Always reset the flag to allow future document changes
    isApplyingCRDTUpdate = false;
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
