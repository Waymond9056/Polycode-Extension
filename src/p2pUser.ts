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
  clientId?: string;
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
  private connections: any[] = []; // Store actual connection objects
  private applyCRDTUpdatesToFile: (updates: any[]) => Promise<void>;

  constructor(
    topicName: string = "polycode",
    clientId?: string,
    applyCRDTUpdatesToFile?: (updates: any[]) => Promise<void>
  ) {
    this.swarm = new Hyperswarm();
    this.topic = Buffer.alloc(32).fill(topicName); // A topic must be 32 bytes
    this.clientId = clientId || this.generateClientId();
    this.applyCRDTUpdatesToFile =
      applyCRDTUpdatesToFile || (() => Promise.resolve());
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
      console.log("🎉 NEW P2P CONNECTION ESTABLISHED!");
      console.log(
        "Peer ID:",
        info.peer?.toString("hex")?.substring(0, 16) || "unknown"
      );
      console.log("Total peers now:", this.swarm.peers.length);

      // Store the connection object
      this.connections.push(conn);
      console.log("Total connections now:", this.connections.length);

      conn.on("data", async (data: Buffer) => {
        try {
          const messageStr = data.toString();
          console.log("Received raw message:", messageStr);

          // Try to parse as JSON message
          try {
            const message: P2PMessage = JSON.parse(messageStr);
            await this.handleMessage(message);
          } catch (parseError) {
            // If not JSON, treat as plain text (like the working example)
            console.log("Received plain text message:", messageStr);

            // Auto-respond to test messages
            if (messageStr === "I LOVE YOU") {
              console.log("Auto-responding with: I LOVE YOU TOO");
              // Send response to the same connection that sent the message
              conn.write("I LOVE YOU TOO");
            }
          }
        } catch (error) {
          console.error("Error handling P2P message:", error);
        }
      });

      conn.on("error", (error: Error) => {
        console.error("P2P connection error:", error);
      });

      conn.on("close", () => {
        // Remove the connection from our array
        const index = this.connections.indexOf(conn);
        if (index > -1) {
          this.connections.splice(index, 1);
        }
        console.log(
          "P2P connection closed. Remaining peers:",
          this.swarm.peers.length,
          "Remaining connections:",
          this.connections.length
        );
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
      // Both users act as both server and client for bidirectional communication
      console.log("🚀 Starting P2P user in bidirectional mode...");
      console.log("📡 Topic:", this.topic.toString("hex"));
      console.log("🆔 Client ID:", this.clientId);

      const discovery = this.swarm.join(this.topic, {
        server: true,
        client: true,
      });
      console.log("⏳ Waiting for topic to be announced on DHT...");
      await discovery.flushed(); // Wait for topic to be announced
      console.log("✅ Topic announced on DHT");

      console.log("⏳ Waiting for swarm to connect to pending peers...");
      await this.swarm.flush(); // Waits for the swarm to connect to pending peers
      console.log(
        "✅ P2P User started in bidirectional mode - can send and receive..."
      );
      console.log("👥 Current peer count:", this.swarm.peers.length);
      console.log("🔗 Current connections:", this.connections.length);

      // Start periodic connection status check
      this.startConnectionStatusCheck();

      this.isStarted = true;
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
      clientId: crdtUpdate.clientId, // Include client ID to prevent echo
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

    // Check if this update originated from this client to prevent infinite loops
    if (message.clientId === this.clientId) {
      console.log(`Skipping CRDT update from same client: ${message.clientId}`);
      return;
    }

    // Delegate to the extension's applyCRDTUpdatesToFile function to use the proper flag mechanism
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
    console.log(
      "Broadcasting message to",
      this.connections.length,
      "connections"
    );

    // Send to all active connections
    for (const conn of this.connections) {
      try {
        console.log("Writing to connection:", typeof conn.write);
        conn.write(messageStr);
        console.log("Successfully wrote to connection");
      } catch (error) {
        console.error("Error broadcasting to connection:", error);
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

  private startConnectionStatusCheck(): void {
    // Check connection status every 5 seconds
    setInterval(() => {
      if (this.isStarted) {
        console.log(
          `[Connection Check] Peers: ${this.swarm.peers.length}, Connections: ${this.connections.length}`
        );
      }
    }, 5000);
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

  async sendTestMessage(message: string = "I LOVE YOU"): Promise<void> {
    console.log("Sending test message:", message);
    console.log("Available connections:", this.connections.length);

    // Send to all active connections (like the working example)
    for (const conn of this.connections) {
      try {
        console.log("Writing test message to connection:", typeof conn.write);
        conn.write(message);
        console.log("Sent test message to connection");
      } catch (error) {
        console.error("Error sending test message to connection:", error);
      }
    }
  }

  async sendResponseMessage(message: string = "I LOVE YOU TOO"): Promise<void> {
    console.log("Sending response message:", message);
    console.log("Available connections:", this.connections.length);

    // Send to all active connections
    for (const conn of this.connections) {
      try {
        console.log(
          "Writing response message to connection:",
          typeof conn.write
        );
        conn.write(message);
        console.log("Sent response message to connection");
      } catch (error) {
        console.error("Error sending response message to connection:", error);
      }
    }
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
}
