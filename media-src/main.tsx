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

  const pingPeers = () => {
    console.log("Pinging peers with message:", pingMessage);
    vscode.postMessage({
      type: "pingPeers",
      message: pingMessage,
    });
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

        // Only process updates that have actual content changes
        if (message.update.updates && message.update.updates.length > 0) {
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
        } else {
          console.log("Skipping empty CRDT update");
        }
      }
      if (message.type === "p2pStatus") {
        console.log("P2P Status received:", message);
        setP2pStatus(message);
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

  return (
    <div style={{ fontFamily: "var(--vscode-font-family)", padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>
        {flavor === "sidebar" ? "Polycode Sidebar" : "Polycode Panel"}
      </h3>
      <div style={{ display: "grid", gap: 8 }}>
        <VSCodeTextField
          value={text}
          onInput={(e: any) => setText(e.target.value)}
          placeholder="Type something..."
        />
        <VSCodeButton onClick={() => toast(`Hello from ${text}!`)}>
          Say
        </VSCodeButton>
        <VSCodeButton onClick={runFormat} appearance="secondary">
          Format Document
        </VSCodeButton>
        <VSCodeButton
          onClick={() =>
            vscode.postMessage({
              type: "runCommand",
              command: "polycode.openPanel",
            })
          }
        >
          Open Panel
        </VSCodeButton>
        <VSCodeButton onClick={() => insertText("hello")}>
          WRITE HI
        </VSCodeButton>

        <div
          style={{
            border: "1px solid var(--vscode-widget-border)",
            padding: 8,
            borderRadius: 4,
          }}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>CRDT Sync:</h4>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => {
                setAutoSync(e.target.checked);
                autoSyncRef.current = e.target.checked;
                if (e.target.checked) {
                  // Clear pending updates when starting auto-sync
                  setPendingUpdates([]);
                  pendingUpdatesRef.current = [];
                }
              }}
              style={{ margin: 0 }}
            />
            <label
              style={{ fontSize: "0.9em", color: "var(--vscode-foreground)" }}
            >
              Auto-sync every 0.25s
            </label>
          </div>
          {autoSync && (
            <div
              style={{
                fontSize: "0.8em",
                color: "var(--vscode-descriptionForeground)",
                marginBottom: 8,
                padding: 4,
                background: "var(--vscode-inputValidation-infoBackground)",
                border: "1px solid var(--vscode-inputValidation-infoBorder)",
                borderRadius: 4,
              }}
            >
              Auto-sync is active. Changes will be automatically applied to the
              correct files every 0.25 seconds.
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px solid var(--vscode-widget-border)",
            padding: 8,
            borderRadius: 4,
          }}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>Current Editor Content:</h4>
          <VSCodeButton
            onClick={getEditorContent}
            appearance="secondary"
            style={{ marginBottom: 8 }}
          >
            Refresh Content
          </VSCodeButton>
          <VSCodeButton
            onClick={testConnection}
            appearance="secondary"
            style={{ marginBottom: 8 }}
          >
            Test Connection
          </VSCodeButton>
          <VSCodeButton
            onClick={testP2PConnection}
            appearance="secondary"
            style={{ marginBottom: 8 }}
          >
            Test P2P Status
          </VSCodeButton>
          <div
            style={{
              fontFamily: "var(--vscode-editor-font-family)",
              fontSize: "var(--vscode-editor-font-size)",
              background: "var(--vscode-editor-background)",
              padding: 8,
              borderRadius: 4,
              maxHeight: 200,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {editorContent}
          </div>
        </div>

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
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
