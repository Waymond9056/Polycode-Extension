import * as vscode from "vscode";
import Hyperswarm from "hyperswarm";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface P2PMessage {
  type: string;
  timestamp: number;
  peerId?: string;
  messageId?: string; // Unique message ID for routing
  forwardedBy?: string; // Client ID that forwarded this message
  ttl?: number; // Time to live for message forwarding
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
  private peerClientIds: Map<string, string> = new Map(); // Map connection to client ID
  private peerUserNames: Map<string, string> = new Map(); // Map connection to user name
  private userName: string = ""; // Current user's display name
  private applyCRDTUpdatesToFile: (updates: any[]) => Promise<void>;
  private seenMessages: Set<string> = new Set(); // Track seen messages to prevent loops
  private messageHistory: Map<string, number> = new Map(); // Track message timestamps for cleanup

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

  private generateMessageId(): string {
    return `${this.clientId}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}`;
  }

  private cleanupOldMessages(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [messageId, timestamp] of this.messageHistory.entries()) {
      if (now - timestamp > maxAge) {
        this.messageHistory.delete(messageId);
        this.seenMessages.delete(messageId);
      }
    }
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
            await this.handleMessage(message, conn);
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

      // Start periodic message cleanup
      this.startMessageCleanup();

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
      messageId: this.generateMessageId(),
      ttl: 3, // Allow up to 3 hops
    };

    await this.broadcastToSwarm(message);
    console.log("Broadcasted CRDT update to P2P network");
  }

  async broadcastMessage(message: any): Promise<void> {
    console.log("Broadcasting message to swarm:", message);
    await this.broadcastToSwarm(message);
  }

  async identifyPeers(): Promise<void> {
    // Send a ping to help identify peers and get their client IDs
    await this.pingPeers("Peer identification ping");
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
        messageId: this.generateMessageId(),
        ttl: 3, // Allow up to 3 hops
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

  private async handleMessage(
    message: P2PMessage,
    senderConnection?: any
  ): Promise<void> {
    console.log("Received P2P message:", message);

    // Check if we've already seen this message to prevent loops
    if (message.messageId && this.seenMessages.has(message.messageId)) {
      console.log("Ignoring duplicate message:", message.messageId);
      return;
    }

    // Mark message as seen
    if (message.messageId) {
      this.seenMessages.add(message.messageId);
      this.messageHistory.set(message.messageId, Date.now());
    }

    // Check TTL and decrement if forwarding
    if (message.ttl !== undefined && message.ttl <= 0) {
      console.log("Message TTL expired, not forwarding");
      return;
    }

    // Track client ID from any message that contains it
    if (message.clientId) {
      const connectionKey = this.getConnectionKey(message);
      if (connectionKey) {
        this.peerClientIds.set(connectionKey, message.clientId);
        console.log(
          `Tracked client ID: ${message.clientId} for connection ${connectionKey}`
        );
      }
    }

    // Track user name from userNameUpdate messages
    if (message.type === "userNameUpdate" && (message as any).userName) {
      const connectionKey = this.getConnectionKey(message);
      if (connectionKey) {
        this.peerUserNames.set(connectionKey, (message as any).userName);
        console.log(
          `Tracked user name: ${
            (message as any).userName
          } for connection ${connectionKey}`
        );
      }
    }

    // Process the message locally
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

      case "syncRequest":
        await this.handleSyncRequest(message as any);
        break;

      default:
        console.log("Unknown P2P message type:", message.type);
    }

    // Forward the message to other peers (except the sender)
    if (message.ttl !== undefined && message.ttl > 0) {
      const forwardedMessage = {
        ...message,
        ttl: message.ttl - 1,
        forwardedBy: this.clientId,
      };

      console.log(
        `Forwarding message ${message.messageId} with TTL ${forwardedMessage.ttl}`
      );
      await this.broadcastToSwarm(forwardedMessage, senderConnection);
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

  private async broadcastToSwarm(
    message: P2PMessage,
    excludeConnection?: any
  ): Promise<void> {
    // Add message routing metadata if not present
    if (!message.messageId) {
      message.messageId = this.generateMessageId();
    }
    if (!message.ttl) {
      message.ttl = 3; // Default TTL of 3 hops
    }

    // Mark this message as seen to prevent loops
    this.seenMessages.add(message.messageId);
    this.messageHistory.set(message.messageId, Date.now());

    const messageStr = JSON.stringify(message);
    console.log(
      "Broadcasting message to",
      this.connections.length,
      "connections (excluding sender)"
    );

    // Send to all active connections except the sender
    for (const conn of this.connections) {
      if (conn === excludeConnection) {
        continue; // Don't send back to the sender
      }
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

  private getConnectionKey(message: P2PMessage): string | null {
    // Try to find the connection that sent this message
    // This is a simplified approach - in a real implementation, you'd need to track which connection sent which message
    for (let i = 0; i < this.connections.length; i++) {
      const conn = this.connections[i];
      const key = conn.remotePublicKey
        ? conn.remotePublicKey.toString("hex")
        : `conn_${i}`;
      return key;
    }
    return null;
  }

  setUserName(userName: string): void {
    this.userName = userName;
    console.log(`User name set to: ${userName}`);
  }

  getConnectedPeers(): any[] {
    // Return peer info with user names if available, otherwise client IDs
    return this.connections.map((conn, index) => {
      const connectionKey = conn.remotePublicKey
        ? conn.remotePublicKey.toString("hex")
        : `conn_${index}`;
      const clientId = this.peerClientIds.get(connectionKey) || `peer_${index}`;
      const userName = this.peerUserNames.get(connectionKey) || clientId;

      return {
        id: `peer_${index}`,
        clientId: clientId,
        userName: userName,
        peerId: conn.remotePublicKey
          ? conn.remotePublicKey.toString("hex").substring(0, 8)
          : `peer_${index}`,
      };
    });
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

  private startMessageCleanup(): void {
    // Clean up old messages every 2 minutes
    setInterval(() => {
      if (this.isStarted) {
        this.cleanupOldMessages();
      }
    }, 2 * 60 * 1000);
  }

  async pingPeers(message?: string): Promise<void> {
    const pingMessage: P2PPingMessage = {
      type: "p2p_ping",
      timestamp: Date.now(),
      clientId: this.clientId,
      message: message || "Ping from " + this.clientId,
      peerId: this.swarm.peerId ? this.swarm.peerId.toString("hex") : "unknown",
      messageId: this.generateMessageId(),
      ttl: 3, // Allow up to 3 hops
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
      messageId: this.generateMessageId(),
      ttl: 3, // Allow up to 3 hops
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

  private async handleSyncRequest(message: any): Promise<void> {
    console.log("Received sync request from peer:", message.message);

    // Show notification to user
    vscode.window.showInformationMessage(
      `Sync request received: ${message.message}`
    );

    // Add delay to ensure the sender's save/commit/push completes first
    const delayMs = 5000; // 5 seconds delay
    console.log(
      `Waiting ${delayMs}ms before syncing to ensure remote changes are available...`
    );

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    console.log("Delay completed, starting sync...");

    // Get the active workspace folder (the user's project, not the extension)
    const activeWorkspace = vscode.workspace.workspaceFolders?.[0];
    if (!activeWorkspace) {
      vscode.window.showErrorMessage("No active workspace found for sync");
      return;
    }

    const workspacePath = activeWorkspace.uri.fsPath;
    console.log(`Syncing in workspace: ${workspacePath}`);

    // Use spawn instead of exec for better shell compatibility
    const { spawn } = require("child_process");

    console.log(`Starting sync process in: ${workspacePath}`);

    // Execute commands step by step for better reliability
    const executeCommand = (
      command: string,
      description: string,
      timeoutMs: number = 30000
    ): Promise<void> => {
      return new Promise((resolve, reject) => {
        console.log(`Executing: ${description}`);
        const child = spawn("bash", ["-c", command], {
          cwd: workspacePath,
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
        });

        let stdout = "";
        let stderr = "";
        let isResolved = false;

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          if (!isResolved) {
            console.log(
              `${description} timed out after ${timeoutMs}ms, killing process...`
            );
            child.kill("SIGTERM");
            reject(new Error(`${description} timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);

        child.stdout.on("data", (data: Buffer) => {
          const output = data.toString();
          stdout += output;
          console.log(`${description} output: ${output}`);
        });

        child.stderr.on("data", (data: Buffer) => {
          const output = data.toString();
          stderr += output;
          console.log(`${description} error: ${output}`);
        });

        child.on("close", (code: number | null) => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(timeout);
          console.log(`${description} exited with code: ${code}`);
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(`${description} failed with code ${code}: ${stderr}`)
            );
          }
        });

        child.on("error", (error: Error) => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(timeout);
          reject(new Error(`${description} process error: ${error.message}`));
        });
      });
    };

    try {
      // Execute sync commands step by step
      await executeCommand(
        `echo "=== Current branch ===" && git branch -v`,
        "Branch check"
      );
      await executeCommand(
        `echo "=== Remote status ===" && git remote -v`,
        "Remote check"
      );
      await executeCommand(
        `echo "=== Fetching latest ===" && git fetch origin --timeout=10`,
        "Fetch",
        15000 // 15 second timeout for fetch
      );
      await executeCommand(
        `echo "=== Remote main status ===" && git log --oneline origin/main -5`,
        "Remote main check"
      );
      await executeCommand(
        `echo "=== Resetting to origin/main ===" && git reset --hard origin/main`,
        "Reset to origin/main"
      );
      await executeCommand(
        `echo "=== Pulling latest changes ===" && git pull`,
        "Pull"
      );
      await executeCommand(
        `echo "=== Final status ===" && git status`,
        "Final status"
      );
      await executeCommand(
        `echo "=== Current commit ===" && git log --oneline -3`,
        "Current commit"
      );
      await executeCommand(
        `echo "=== Sync completed successfully ==="`,
        "Success message"
      );

      vscode.window.showInformationMessage(`Workspace synced successfully`);
    } catch (error: any) {
      console.error(`Sync failed: ${error.message}`);
      vscode.window.showErrorMessage(`Sync failed: ${error.message}`);
    }
  }
}
