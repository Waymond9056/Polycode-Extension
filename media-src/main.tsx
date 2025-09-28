import React from "react";
import { createRoot } from "react-dom/client";
import {
  VSCodeButton,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";

declare global {
  // VS Code injects this into the webview
  function acquireVsCodeApi(): {
    postMessage: (data: unknown) => void;
    getState: () => any;
    setState: (s: any) => void;
  };
}

const vscode = acquireVsCodeApi();

function App() {
  const flavor =
    (document.getElementById("root") as HTMLElement)?.dataset?.flavor ??
    "sidebar";
  const [text, setText] = React.useState("Polycode");
  const [editorContent, setEditorContent] = React.useState("No editor content");
  const [crdtUpdates, setCrdtUpdates] = React.useState<any[]>([]);
  const [autoSync, setAutoSync] = React.useState<boolean>(false);
  const [pendingUpdates, setPendingUpdates] = React.useState<any[]>([]);
  const autoSyncRef = React.useRef<boolean>(false);
  const pendingUpdatesRef = React.useRef<any[]>([]);
  const [p2pStatus, setP2pStatus] = React.useState<any>(null);
  const [currentPage, setCurrentPage] = React.useState<
    "main" | "save" | "settings"
  >("main");
  const [commitTitle, setCommitTitle] = React.useState<string>("Saving");
  const [commitMessage, setCommitMessage] = React.useState<string>("");
  const [connectedUsers, setConnectedUsers] = React.useState<string[]>([]);
  const [userName, setUserName] = React.useState<string>("");
  const [pingMessage, setPingMessage] = React.useState<string>(
    "Hello from " + Math.random().toString(36).substring(2, 8)
  );

  const toast = (t: string) => vscode.postMessage({ type: "toast", text: t });
  const runFormat = () =>
    vscode.postMessage({
      type: "runCommand",
      command: "editor.action.formatDocument",
    });
  const insertText = (text: string) => {
    const message = { type: "insertText", text: text };
    console.log("Sending insertText message:", message);
    vscode.postMessage(message);
  };

  const getEditorContent = () => {
    console.log("Requesting editor content...");
    const message = { type: "getEditorContent" };
    console.log("Sending message:", message);
    vscode.postMessage(message);
    // Also try a simple test
    vscode.postMessage({ type: "toast", text: "Requesting editor content..." });
  };

  const testConnection = () => {
    console.log("Testing connection...");
    vscode.postMessage({ type: "testConnection" });
  };

  const testP2PConnection = () => {
    console.log("Testing P2P connection...");
    vscode.postMessage({ type: "getP2PStatus" });
  };

  const navigateToSavePage = () => {
    setCurrentPage("save");
  };

  const navigateToMain = () => {
    setCurrentPage("main");
  };

  const navigateToSettings = () => {
    setCurrentPage("settings");
  };

  const saveUserName = () => {
    // Save the user name and broadcast it to peers
    vscode.postMessage({
      type: "setUserName",
      userName: userName,
    });
    setCurrentPage("main");
  };

  const executeSave = () => {
    const fullMessage = commitMessage
      ? `${commitTitle}: ${commitMessage}`
      : commitTitle;

    // Use inline git commands for now to avoid path issues
    const script = `git checkout -b Saving && git add . && git commit -m "${fullMessage}" && git checkout main && git merge Saving && git branch -d Saving && git push`;
    vscode.postMessage({
      type: "executeShell",
      script: script,
    });
    setCurrentPage("main"); // Navigate back to main after executing
  };

  const pingPeers = () => {
    console.log("Pinging peers with message:", pingMessage);
    vscode.postMessage({
      type: "pingPeers",
      message: pingMessage,
    });
  };

  const sendTestMessage = () => {
    console.log("Sending test message like the working example");
    vscode.postMessage({
      type: "sendTestMessage",
      message: "I LOVE YOU",
    });
  };

  const sendResponseMessage = () => {
    console.log("Sending response message");
    vscode.postMessage({
      type: "sendResponseMessage",
      message: "I LOVE YOU TOO",
    });
  };

  const manualSync = () => {
    console.log("Manual sync requested");
    vscode.postMessage({
      type: "executeShell",
      script:
        "git clean -fd && git reset --hard HEAD && git fetch origin && git reset --hard origin/main && git pull && git status",
    });
    // Send a separate message for the independent git pull
    setTimeout(() => {
      vscode.postMessage({
        type: "executeShell",
        script: "git pull",
      });
    }, 2000);
  };

  const applyCRDTUpdates = () => {
    console.log(
      "applyCRDTUpdates called, pendingUpdates:",
      pendingUpdatesRef.current.length
    );

    if (pendingUpdatesRef.current.length === 0) {
      console.log("No pending updates to apply");
      return; // No pending updates to apply
    }

    console.log(
      "Applying pending CRDT updates, Count:",
      pendingUpdatesRef.current.length
    );
    vscode.postMessage({
      type: "applyCRDTUpdates",
      updates: pendingUpdatesRef.current,
    });

    // Clear pending updates after applying
    setPendingUpdates([]);
    pendingUpdatesRef.current = [];
  };

  // Auto-sync effect
  React.useEffect(() => {
    console.log("Auto-sync effect running, autoSync:", autoSync);
    if (!autoSync) {
      return;
    }

    console.log("Setting up auto-sync interval");
    const interval = setInterval(() => {
      applyCRDTUpdates();
    }, 250); // 0.25 seconds

    return () => {
      console.log("Clearing auto-sync interval");
      clearInterval(interval);
    };
  }, [autoSync]);

  // Listen for messages from the extension using VS Code webview API
  React.useEffect(() => {
    const handleMessage = (message: any) => {
      console.log("Received message:", message);
      if (message.type === "editorContent") {
        console.log("Setting editor content:", message.content);
        setEditorContent(message.content || "No content");
      }
      if (message.type === "testResponse") {
        console.log("Test response received:", message.data);
        setEditorContent("Connection working! " + message.data);
      }
      if (message.type === "crdtUpdate") {
        console.log("CRDT Update received:", message.update);
        console.log("autoSyncRef.current:", autoSyncRef.current);
        setCrdtUpdates((prev) => [message.update, ...prev.slice(0, 9)]); // Keep last 10 updates

        // Add to pending updates if auto-sync is enabled
        if (autoSyncRef.current) {
          console.log("Adding to pending updates");
          setPendingUpdates((prev) => {
            const newUpdates = [...prev, message.update];
            pendingUpdatesRef.current = newUpdates; // Update ref
            return newUpdates;
          });
        } else {
          console.log("Auto-sync not enabled, not adding to pending");
        }
      }
      if (message.type === "p2pStatus") {
        console.log("P2P Status received:", message);
        setP2pStatus(message);

        // Extract connected users from P2P status
        if (message.peers && Array.isArray(message.peers)) {
          const userList = message.peers.map(
            (peer: any) =>
              peer.userName || peer.clientId || peer.peerId || "Unknown User"
          );
          setConnectedUsers(userList);
        } else if (message.peerCount > 0) {
          // If we have peer count but no detailed peer info, show generic users
          setConnectedUsers(Array(message.peerCount).fill("Connected User"));
        } else {
          setConnectedUsers([]);
        }
      }
    };

    // VS Code webview message handling - use the proper API
    const messageListener = (event: MessageEvent) => {
      console.log("Window message event:", event);
      console.log("Event data:", event.data);
      if (event.data && event.data.type) {
        handleMessage(event.data);
      }
    };

    window.addEventListener("message", messageListener);
    return () => {
      window.removeEventListener("message", messageListener);
    };
  }, []);

  // Periodically request P2P status to keep connected users updated
  React.useEffect(() => {
    const interval = setInterval(() => {
      vscode.postMessage({ type: "getP2PStatus" });
    }, 3000); // Check every 3 seconds

    return () => clearInterval(interval);
  }, []);

  const renderMainPage = () => (
    <div style={{ fontFamily: "var(--vscode-font-family)", padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>
        {flavor === "sidebar" ? "Polycode Sidebar" : "Polycode Panel"}
      </h3>

      {/* Icon buttons row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          justifyContent: "center",
        }}
      >
        <VSCodeButton
          onClick={navigateToSavePage}
          appearance="secondary"
          style={{
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
          title="Save"
        >
          💾
        </VSCodeButton>
        <VSCodeButton
          onClick={() =>
            vscode.postMessage({
              type: "runCommand",
              command: "workbench.action.debug.start",
            })
          }
          appearance="secondary"
          style={{
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
          title="Run"
        >
          ▶️
        </VSCodeButton>
        <VSCodeButton
          onClick={manualSync}
          appearance="secondary"
          style={{
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
          title="Sync"
        >
          🔄
        </VSCodeButton>
        <VSCodeButton
          onClick={navigateToSettings}
          appearance="secondary"
          style={{
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
          title="Settings"
        >
          ⚙️
        </VSCodeButton>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div
          style={{
            border: "1px solid var(--vscode-widget-border)",
            padding: 8,
            borderRadius: 4,
          }}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>CRDT Updates:</h4>
          <div
            style={{
              fontFamily: "var(--vscode-editor-font-family)",
              fontSize: "var(--vscode-editor-font-size)",
              background: "var(--vscode-editor-background)",
              padding: 8,
              borderRadius: 4,
              maxHeight: 300,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {crdtUpdates.length === 0
              ? "No CRDT updates yet. Start typing in your editor!"
              : crdtUpdates.map((update, index) => (
                  <div
                    key={index}
                    style={{
                      marginBottom: 8,
                      padding: 4,
                      border: "1px solid var(--vscode-widget-border)",
                      borderRadius: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.8em",
                        color: "var(--vscode-descriptionForeground)",
                        marginBottom: 4,
                      }}
                    >
                      Update #{crdtUpdates.length - index} -{" "}
                      {new Date(update.timestamp).toLocaleTimeString()}
                    </div>
                    <pre
                      style={{ margin: 0, fontSize: "0.7em", overflow: "auto" }}
                    >
                      {JSON.stringify(update, null, 2)}
                    </pre>
                  </div>
                ))}
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--vscode-widget-border)",
            padding: 8,
            borderRadius: 4,
          }}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>P2P Connection Test:</h4>

          {p2pStatus && (
            <div
              style={{
                fontSize: "0.9em",
                marginBottom: 8,
                padding: 4,
                background: p2pStatus.isConnected
                  ? "var(--vscode-inputValidation-infoBackground)"
                  : "var(--vscode-inputValidation-errorBackground)",
                border: `1px solid ${
                  p2pStatus.isConnected
                    ? "var(--vscode-inputValidation-infoBorder)"
                    : "var(--vscode-inputValidation-errorBorder)"
                }`,
                borderRadius: 4,
              }}
            >
              <strong>Status:</strong>{" "}
              {p2pStatus.isConnected ? "Connected" : "Not Connected"}
              <br />
              <strong>Peer Count:</strong> {p2pStatus.peerCount}
              <br />
              <strong>Peer ID:</strong>{" "}
              {p2pStatus.peerId
                ? p2pStatus.peerId.substring(0, 16) + "..."
                : "Unknown"}
              <br />
              <strong>Client ID:</strong>{" "}
              {p2pStatus.clientId
                ? p2pStatus.clientId.substring(0, 16) + "..."
                : "Unknown"}
            </div>
          )}

          <VSCodeTextField
            value={pingMessage}
            onInput={(e: any) => setPingMessage(e.target.value)}
            placeholder="Enter ping message"
            style={{ marginBottom: 8, width: "100%" }}
          />
          <VSCodeButton
            onClick={pingPeers}
            appearance="primary"
            style={{ marginBottom: 8 }}
          >
            Ping Peers
          </VSCodeButton>
          <VSCodeButton
            onClick={sendTestMessage}
            appearance="secondary"
            style={{ marginBottom: 8 }}
          >
            Send Test Message
          </VSCodeButton>
          <VSCodeButton
            onClick={sendResponseMessage}
            appearance="secondary"
            style={{ marginBottom: 8 }}
          >
            Send Response
          </VSCodeButton>
        </div>

        {/* Connected Users Display */}
        <div
          style={{
            border: "1px solid var(--vscode-widget-border)",
            padding: 8,
            borderRadius: 4,
            marginTop: 16,
          }}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>
            Connected Users ({connectedUsers.length}):
          </h4>
          <div
            style={{
              fontFamily: "var(--vscode-editor-font-family)",
              fontSize: "0.9em",
              background: "var(--vscode-editor-background)",
              padding: 8,
              borderRadius: 4,
              minHeight: "60px",
              maxHeight: "120px",
              overflow: "auto",
              border: "1px solid var(--vscode-widget-border)",
            }}
          >
            {connectedUsers.length === 0 ? (
              <div
                style={{
                  color: "var(--vscode-descriptionForeground)",
                  fontStyle: "italic",
                }}
              >
                No users connected
              </div>
            ) : (
              connectedUsers.map((user, index) => (
                <div
                  key={index}
                  style={{
                    padding: "2px 4px",
                    marginBottom: 2,
                    borderRadius: 3,
                    backgroundColor:
                      "var(--vscode-inputValidation-infoBackground)",
                    color: "var(--vscode-inputValidation-infoForeground)",
                  }}
                >
                  👤 {user}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderSavePage = () => (
    <div style={{ fontFamily: "var(--vscode-font-family)", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Save Changes</h3>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label
            style={{ display: "block", marginBottom: 4, fontSize: "0.9em" }}
          >
            Commit Title:
          </label>
          <VSCodeTextField
            value={commitTitle}
            onInput={(e: any) => setCommitTitle(e.target.value)}
            placeholder="Enter commit title..."
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            style={{ display: "block", marginBottom: 4, fontSize: "0.9em" }}
          >
            Commit Message:
          </label>
          <textarea
            value={commitMessage}
            onChange={(e: any) => setCommitMessage(e.target.value)}
            placeholder="Enter commit message..."
            style={{
              width: "100%",
              minHeight: "80px",
              padding: "8px",
              border: "1px solid var(--vscode-input-border)",
              borderRadius: "4px",
              backgroundColor: "var(--vscode-input-background)",
              color: "var(--vscode-input-foreground)",
              fontFamily: "var(--vscode-font-family)",
              fontSize: "var(--vscode-font-size)",
              resize: "vertical",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <VSCodeButton onClick={navigateToMain} appearance="secondary">
            Cancel
          </VSCodeButton>
          <VSCodeButton onClick={executeSave} appearance="primary">
            💾 Commit & Save
          </VSCodeButton>
        </div>
      </div>
    </div>
  );

  const renderSettingsPage = () => (
    <div style={{ fontFamily: "var(--vscode-font-family)", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <VSCodeButton
          onClick={navigateToMain}
          appearance="secondary"
          style={{ marginRight: 8, padding: "4px 8px" }}
        >
          ← Back
        </VSCodeButton>
        <h3 style={{ margin: 0 }}>Settings</h3>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label
            style={{ display: "block", marginBottom: 4, fontSize: "0.9em" }}
          >
            Your Display Name:
          </label>
          <VSCodeTextField
            value={userName}
            onInput={(e: any) => setUserName(e.target.value)}
            placeholder="Enter your name..."
            style={{ width: "100%" }}
          />
          <div
            style={{
              fontSize: "0.8em",
              color: "var(--vscode-descriptionForeground)",
              marginTop: 4,
            }}
          >
            This name will be shown to other connected users
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <VSCodeButton onClick={navigateToMain} appearance="secondary">
            Cancel
          </VSCodeButton>
          <VSCodeButton onClick={saveUserName} appearance="primary">
            💾 Save Name
          </VSCodeButton>
        </div>
      </div>
    </div>
  );

  return currentPage === "main"
    ? renderMainPage()
    : currentPage === "save"
    ? renderSavePage()
    : renderSettingsPage();
}

createRoot(document.getElementById("root")!).render(<App />);
