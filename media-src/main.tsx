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
    "main" | "save" | "settings" | "setup" | "loading"
  >("loading");
  const [hasInitialized, setHasInitialized] = React.useState<boolean>(false);
  const [hasGitRepository, setHasGitRepository] = React.useState<boolean | null>(null);
  const [githubUrl, setGithubUrl] = React.useState<string>("");
  const [isNetworkConnected, setIsNetworkConnected] = React.useState<boolean>(false);
  const [dockerEnabled, setDockerEnabled] = React.useState<boolean>(false);
  const [dockerConfigured, setDockerConfigured] = React.useState<boolean>(false);
  const [supportedLanguages, setSupportedLanguages] = React.useState<string[]>([]);
  const [containerExists, setContainerExists] = React.useState<boolean>(false);
  const [selectedLanguages, setSelectedLanguages] = React.useState<{
    python: boolean;
    java: boolean;
    typescript: boolean;
  }>({
    python: false,
    java: false,
    typescript: false,
  });

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
    vscode.setState({ ...vscode.getState(), currentPage: "save" });
  };

  const navigateToMain = () => {
    setCurrentPage("main");
    vscode.setState({ ...vscode.getState(), currentPage: "main" });
  };

  const navigateToSettings = () => {
    setCurrentPage("settings");
    vscode.setState({ ...vscode.getState(), currentPage: "settings" });
    // Request Docker status when navigating to settings
    vscode.postMessage({ type: "getDockerStatus" });
  };

  const saveUserName = () => {
    // Save the user name and broadcast it to peers
    vscode.postMessage({
      type: "setUserName",
      userName: userName,
    });
    setCurrentPage("main");
    vscode.setState({ ...vscode.getState(), currentPage: "main" });
  };

  const toggleDocker = () => {
    setDockerEnabled(!dockerEnabled);
  };

  const toggleLanguage = (language: keyof typeof selectedLanguages) => {
    setSelectedLanguages(prev => ({
      ...prev,
      [language]: !prev[language]
    }));
  };

  const confirmDockerSetup = () => {
    const selectedLangs = Object.entries(selectedLanguages)
      .filter(([_, selected]) => selected)
      .map(([lang, _]) => lang);
    
    console.log("Confirming Docker setup with languages:", selectedLangs);
    vscode.postMessage({
      type: "dockerSetup",
      enabled: dockerEnabled,
      languages: selectedLangs,
      rebuild: dockerConfigured, // Indicate if this is a rebuild
    });
    setDockerConfigured(true);
  };

  const confirmSetup = () => {
    console.log("Confirming setup with GitHub URL:", githubUrl);
    // TODO: Implement setup logic
    vscode.postMessage({
      type: "setupConfirm",
      githubUrl: githubUrl,
    });
    // For now, just go back to main page
    setCurrentPage("main");
    vscode.setState({ ...vscode.getState(), currentPage: "main" });
  };

  const executeSave = () => {
    const fullMessage = commitMessage
      ? `${commitTitle}: ${commitMessage}`
      : commitTitle;
    const script = `git checkout -b Saving && git add * && git commit -m "${fullMessage}" && git checkout main && git merge Saving && git branch -d Saving && git push`;
    vscode.postMessage({
      type: "executeShell",
      script: script,
    });
    setCurrentPage("main"); // Navigate back to main after executing
    vscode.setState({ ...vscode.getState(), currentPage: "main" });
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

        // Check if network is ready (P2P started, even without peers)
        const networkReady = message.isReady || false;
        const wasConnected = isNetworkConnected;
        setIsNetworkConnected(networkReady);

        // Only change page if network status actually changed
        if (networkReady && !wasConnected) {
          // Network just became ready, switch to appropriate page
          setHasInitialized(true);
          const newPage = hasGitRepository === false ? "setup" : "main";
          setCurrentPage(newPage);
          vscode.setState({ ...vscode.getState(), hasInitialized: true, currentPage: newPage });
        } else if (!networkReady && wasConnected) {
          // Network just became not ready, show loading screen
          setCurrentPage("loading");
        }

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
      if (message.type === "gitStatus") {
        console.log("Git status received:", message);
        const wasGitRepository = hasGitRepository;
        setHasGitRepository(message.hasGitRepository);
        
        // Only change page if git status changed and network is ready
        if (!message.hasGitRepository && isNetworkConnected && wasGitRepository !== false) {
          setCurrentPage("setup");
          vscode.setState({ ...vscode.getState(), currentPage: "setup" });
        }
      }
      if (message.type === "dockerStatus") {
        console.log("Received Docker status:", message);
        setDockerEnabled(message.dockerEnabled);
        setDockerConfigured(message.dockerEnabled);
        setSupportedLanguages(message.supportedLanguages || []);
        setContainerExists(message.containerExists);
        
        // Auto-select supported languages if Docker is already configured
        if (message.dockerEnabled && message.supportedLanguages) {
          setSelectedLanguages({
            python: message.supportedLanguages.includes('python'),
            java: message.supportedLanguages.includes('java'),
            typescript: message.supportedLanguages.includes('typescript'),
          });
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

  // Check network status on component mount (when sidebar opens)
  React.useEffect(() => {
    console.log("Component mounted, checking network status...");
    vscode.postMessage({ type: "getP2PStatus" });
  }, []);

  // Periodically request P2P status to keep connected users updated
  // Disabled to prevent overriding current page
  // React.useEffect(() => {
  //   const interval = setInterval(() => {
  //     vscode.postMessage({ type: "getP2PStatus" });
  //   }, 3000); // Check every 3 seconds

  //   return () => clearInterval(interval);
  // }, []);

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
              type: "runFile",
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
          title="Run Current File"
        >
          ▶️
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
            Save Name
          </VSCodeButton>
        </div>

        {/* Docker Settings Section */}
        <div>
          <label
            style={{ display: "block", marginBottom: 4, fontSize: "0.9em" }}
          >
            Docker Configuration:
          </label>
          
          <VSCodeButton
            onClick={toggleDocker}
            appearance={dockerEnabled ? "primary" : "secondary"}
            style={{ marginBottom: 12 }}
          >
            {dockerEnabled ? "Docker Enabled" : "Enable Docker"}
          </VSCodeButton>

          {dockerEnabled && (
            <div>
              <label
                style={{ display: "block", marginBottom: 8, fontSize: "0.9em" }}
              >
                Select Languages:
              </label>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedLanguages.python}
                    onChange={() => toggleLanguage("python")}
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.9em" }}>
                    Python {supportedLanguages.includes('python') && '(configured)'}
                  </span>
                </label>
                
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedLanguages.java}
                    onChange={() => toggleLanguage("java")}
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.9em" }}>
                    Java {supportedLanguages.includes('java') && '(configured)'}
                  </span>
                </label>
                
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedLanguages.typescript}
                    onChange={() => toggleLanguage("typescript")}
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.9em" }}>
                    TypeScript {supportedLanguages.includes('typescript') && '(configured)'}
                  </span>
                </label>
              </div>
              
              <div
                style={{
                  fontSize: "0.8em",
                  color: "var(--vscode-descriptionForeground)",
                  marginTop: 4,
                }}
              >
                {dockerConfigured 
                  ? "Changes will rebuild the Docker container with new language support"
                  : "Selected languages will be available for code execution in Docker containers"
                }
              </div>
              
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <VSCodeButton
                  onClick={confirmDockerSetup}
                  appearance="primary"
                  disabled={Object.values(selectedLanguages).every(selected => !selected)}
                >
                  {dockerConfigured ? "Update Docker Setup" : "Confirm Docker Setup"}
                </VSCodeButton>
              </div>
              
              {dockerConfigured && containerExists && (
                <div style={{ 
                  fontSize: "0.8em", 
                  color: "var(--vscode-inputValidation-infoForeground)",
                  marginTop: 8,
                  padding: 8,
                  backgroundColor: "var(--vscode-inputValidation-infoBackground)",
                  borderRadius: 4
                }}>
                  Container ready for execution
                </div>
              )}
            </div>
          )}
          
          {dockerConfigured && (
            <div
              style={{
                fontSize: "0.8em",
                color: "var(--vscode-inputValidation-infoForeground)",
                backgroundColor: "var(--vscode-inputValidation-infoBackground)",
                border: "1px solid var(--vscode-inputValidation-infoBorder)",
                padding: 8,
                borderRadius: 4,
                marginTop: 8,
              }}
            >
              Docker configuration completed successfully
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderLoadingPage = () => (
    <div style={{ fontFamily: "var(--vscode-font-family)", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Connecting to Network</h3>
      </div>

      <div
        style={{
          border: "1px solid var(--vscode-widget-border)",
          padding: 24,
          borderRadius: 4,
          textAlign: "center",
          backgroundColor: "var(--vscode-editor-background)",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid var(--vscode-widget-border)",
              borderTop: "3px solid var(--vscode-button-background)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <h4 style={{ margin: "0 0 8px 0", color: "var(--vscode-foreground)" }}>
            Establishing P2P Connection
          </h4>
          <p style={{ margin: 0, fontSize: "0.9em", color: "var(--vscode-descriptionForeground)" }}>
            Connecting to the Polycode network...
          </p>
        </div>

        <div
          style={{
            fontSize: "0.8em",
            color: "var(--vscode-descriptionForeground)",
            fontStyle: "italic",
          }}
        >
          This may take a few moments
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );

  const renderSetupPage = () => (
    <div style={{ fontFamily: "var(--vscode-font-family)", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Setup Required</h3>
      </div>

      <div
        style={{
          border: "1px solid var(--vscode-widget-border)",
          padding: 16,
          borderRadius: 4,
          backgroundColor: "var(--vscode-inputValidation-warningBackground)",
          borderColor: "var(--vscode-inputValidation-warningBorder)",
        }}
      >
        <h4 style={{ margin: "0 0 8px 0", color: "var(--vscode-inputValidation-warningForeground)" }}>
          ⚠️ Git Repository Not Found
        </h4>
        <p style={{ margin: "0 0 16px 0", fontSize: "0.9em", color: "var(--vscode-inputValidation-warningForeground)" }}>
          This workspace doesn't contain a git repository. Polycode requires git for collaborative features.
        </p>
        
        {/* GitHub URL Input */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{ display: "block", marginBottom: 4, fontSize: "0.9em", fontWeight: "bold" }}
          >
            GitHub Repository URL:
          </label>
          <VSCodeTextField
            value={githubUrl}
            onInput={(e: any) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/username/repository.git"
            style={{ width: "100%" }}
          />
          <div
            style={{
              fontSize: "0.8em",
              color: "var(--vscode-descriptionForeground)",
              marginTop: 4,
            }}
          >
            Enter the GitHub repository URL to clone and set up this workspace
          </div>
        </div>


        {/* Confirm Button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <VSCodeButton
            onClick={confirmSetup}
            appearance="primary"
            disabled={!githubUrl.trim()}
          >
            Confirm Setup
          </VSCodeButton>
        </div>
      </div>
    </div>
  );

  return currentPage === "loading"
    ? renderLoadingPage()
    : currentPage === "main"
    ? renderMainPage()
    : currentPage === "save"
    ? renderSavePage()
    : currentPage === "settings"
    ? renderSettingsPage()
    : renderSetupPage();
}

createRoot(document.getElementById("root")!).render(<App />);
