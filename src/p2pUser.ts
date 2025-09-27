import * as vscode from "vscode";
import Hyperswarm from "hyperswarm";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface P2PMessage {
  type: string;
  timestamp: number;
  peerId?: string;
  [key: string]: any;
}

export interface CRDTUpdateMessage extends P2PMessage {
  type: "crdt_update";
  document: string;
  updates: any[];
}

export interface GitHubSaveMessage extends P2PMessage {
  type: "github_save";
  commitMessage: string;
}

export interface P2PPingMessage extends P2PMessage {
  type: "p2p_ping";
  clientId?: string;
  message?: string;
}

export interface P2PPongMessage extends P2PMessage {
  type: "p2p_pong";
  clientId?: string;
  originalTimestamp: number;
  message?: string;
}

export class P2PUser {
  private swarm: Hyperswarm;
  private topic: Buffer;
  private isStarted: boolean = false;
  private clientId: string;

  constructor(topicName: string = "polycode-collaboration", clientId?: string) {
    this.swarm = new Hyperswarm();
    this.topic = Buffer.alloc(32).fill(topicName); // A topic must be 32 bytes
    this.clientId = clientId || this.generateClientId();
    this.setupSwarm();
  }

  private generateClientId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  private setupSwarm(): void {
    this.swarm.on("connection", (conn: any, info: any) => {
      console.log("New P2P connection established");

      conn.on("data", async (data: Buffer) => {
        try {
          const message: P2PMessage = JSON.parse(data.toString());
          await this.handleMessage(message);
        } catch (error) {
          console.error("Error handling P2P message:", error);
        }
      });

      conn.on("error", (error: Error) => {
        console.error("P2P connection error:", error);
      });

      conn.on("close", () => {
        console.log("P2P connection closed");
      });
    });

    this.swarm.on("error", (error: Error) => {
      console.error("P2P swarm error:", error);
    });
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      console.log("P2P user already started");
      return;
    }

    try {
      const discovery = this.swarm.join(this.topic, {
        server: true,
        client: true,
      });
      await discovery.flushed();
      this.isStarted = true;
      console.log("P2P User started and listening for connections...");
    } catch (error) {
      console.error("Error starting P2P user:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      await this.swarm.destroy();
      this.isStarted = false;
      console.log("P2P swarm stopped");
    } catch (error) {
      console.error("Error stopping P2P user:", error);
      throw error;
    }
  }

  async broadcastCRDTUpdate(crdtUpdate: any): Promise<void> {
    const message: CRDTUpdateMessage = {
      type: "crdt_update",
      timestamp: Date.now(),
      document: crdtUpdate.document,
      updates: crdtUpdate.updates,
      peerId: this.swarm.peerId ? this.swarm.peerId.toString("hex") : "unknown",
    };

    await this.broadcastToSwarm(message);
    console.log("Broadcasted CRDT update to P2P network");
  }

  async saveToGitHub(
    commitMessage: string = "Auto-save from Polycode P2P"
  ): Promise<boolean> {
    try {
      console.log("Saving to GitHub...");

      // Execute the GitHub save script
      const { stdout, stderr } = await execAsync("./src/github_utils/save.sh");

      if (stderr) {
        console.error("GitHub save error:", stderr);
        return false;
      }

      console.log("GitHub save output:", stdout);

      // Broadcast to the swarm that we saved
      const broadcastMessage: GitHubSaveMessage = {
        type: "github_save",
        timestamp: Date.now(),
        commitMessage: commitMessage,
        peerId: this.swarm.peerId
          ? this.swarm.peerId.toString("hex")
          : "unknown",
      };

      await this.broadcastToSwarm(broadcastMessage);
      console.log("Broadcasted save notification to P2P network");

      return true;
    } catch (error) {
      console.error("Error saving to GitHub:", error);
      return false;
    }
  }

  async syncFromGitHub(): Promise<boolean> {
    try {
      console.log("Syncing from GitHub...");

      // Execute the GitHub sync script
      const { stdout, stderr } = await execAsync("./src/github_utils/sync.sh");

      if (stderr) {
        console.error("GitHub sync error:", stderr);
        return false;
      }

      console.log("GitHub sync output:", stdout);
      console.log("Code successfully synced from GitHub");

      return true;
    } catch (error) {
      console.error("Error syncing from GitHub:", error);
      return false;
    }
  }

  private async handleMessage(message: P2PMessage): Promise<void> {
    console.log("Received P2P message:", message);

    switch (message.type) {
      case "crdt_update":
        await this.handleCRDTUpdate(message as CRDTUpdateMessage);
        break;

      case "github_save":
        await this.handleGitHubSave(message as GitHubSaveMessage);
        break;

      case "p2p_ping":
        await this.handlePing(message as P2PPingMessage);
        break;

      case "p2p_pong":
        await this.handlePong(message as P2PPongMessage);
        break;

      default:
        console.log("Unknown P2P message type:", message.type);
    }
  }

  private async handleCRDTUpdate(message: CRDTUpdateMessage): Promise<void> {
    console.log(
      `Received CRDT update from peer ${message.peerId} for document: ${message.document}`
    );

    // Apply the CRDT updates to the corresponding file automatically
    try {
      await this.applyCRDTUpdatesToFile([message]);

      vscode.window.showInformationMessage(
        `Applied code update from peer ${message.peerId?.substring(0, 8)}...`
      );
    } catch (error) {
      console.error("Error applying CRDT update:", error);
      vscode.window.showErrorMessage(
        `Failed to apply update from peer ${message.peerId?.substring(0, 8)}...`
      );
    }
  }

  private async handleGitHubSave(message: GitHubSaveMessage): Promise<void> {
    console.log(
      `Peer ${message.peerId} saved to GitHub with message: "${message.commitMessage}"`
    );
    console.log("Triggering sync from GitHub...");

    const success = await this.syncFromGitHub();
    if (success) {
      vscode.window.showInformationMessage(
        `Synced latest changes from peer ${message.peerId?.substring(0, 8)}...`
      );
    }
  }

  private async broadcastToSwarm(message: P2PMessage): Promise<void> {
    const messageStr = JSON.stringify(message);

    // Send to all connected peers
    for (const peer of this.swarm.peers) {
      try {
        peer.write(messageStr);
      } catch (error) {
        console.error("Error broadcasting to peer:", error);
      }
    }
  }

  getPeerCount(): number {
    return this.swarm.peers.length;
  }

  getPeerId(): string | undefined {
    return this.swarm.peerId ? this.swarm.peerId.toString("hex") : undefined;
  }

  isConnected(): boolean {
    return this.isStarted && this.swarm.peers.length > 0;
  }

  getClientId(): string {
    return this.clientId;
  }

  async pingPeers(message?: string): Promise<void> {
    const pingMessage: P2PPingMessage = {
      type: "p2p_ping",
      timestamp: Date.now(),
      clientId: this.clientId,
      message: message || "Ping from " + this.clientId,
      peerId: this.swarm.peerId ? this.swarm.peerId.toString("hex") : "unknown",
    };

    await this.broadcastToSwarm(pingMessage);
    console.log("Pinged all peers with message:", pingMessage.message);
  }

  private async handlePing(message: P2PPingMessage): Promise<void> {
    console.log(`Received ping from ${message.clientId}: ${message.message}`);

    // Respond with pong
    const pongMessage: P2PPongMessage = {
      type: "p2p_pong",
      timestamp: Date.now(),
      clientId: this.clientId,
      originalTimestamp: message.timestamp,
      message: `Pong from ${this.clientId}`,
      peerId: this.swarm.peerId ? this.swarm.peerId.toString("hex") : "unknown",
    };

    await this.broadcastToSwarm(pongMessage);
    console.log("Sent pong response");
  }

  private async handlePong(message: P2PPongMessage): Promise<void> {
    const latency = Date.now() - message.originalTimestamp;
    console.log(
      `Received pong from ${message.clientId}: ${message.message} (latency: ${latency}ms)`
    );

    // Show notification to user
    vscode.window.showInformationMessage(
      `P2P Connection: ${message.clientId} responded (${latency}ms latency)`
    );
  }

  private async applyCRDTUpdatesToFile(
    updates: CRDTUpdateMessage[]
  ): Promise<void> {
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

      // Convert document URI string to vscode.Uri
      const uri = vscode.Uri.parse(documentUri);

      // Check if file exists, create if it doesn't
      let targetDocument: vscode.TextDocument;
      try {
        targetDocument = await vscode.workspace.openTextDocument(uri);
      } catch (error) {
        // File doesn't exist, create it
        await vscode.workspace.fs.writeFile(uri, Buffer.from(""));
        targetDocument = await vscode.workspace.openTextDocument(uri);
      }

      // Open the target file in an editor
      const editor = await vscode.window.showTextDocument(targetDocument);

      // Apply all updates in chronological order
      for (const update of updates) {
        for (const operation of update.updates) {
          await this.applyCRDTOperation(editor, operation);
        }
      }

      console.log(`Applied ${updates.length} CRDT updates to ${documentUri}`);
    } catch (error) {
      console.error("Error applying CRDT updates:", error);
      throw error;
    }
  }

  private async applyCRDTOperation(
    editor: vscode.TextEditor,
    operation: any
  ): Promise<void> {
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
}
