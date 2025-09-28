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
  const [text, setText] = React.useState("PolyCode");
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
  const [hasGitRepository, setHasGitRepository] = React.useState<
    boolean | null
  >(null);
  const [setupCompleted, setSetupCompleted] = React.useState<boolean>(
    vscode.getState()?.setupCompleted || false
  );
  const [githubUrl, setGithubUrl] = React.useState<string>("");
  const [isNetworkConnected, setIsNetworkConnected] =
    React.useState<boolean>(false);
  const [dockerEnabled, setDockerEnabled] = React.useState<boolean>(false);
  const [dockerConfigured, setDockerConfigured] =
    React.useState<boolean>(false);
  const [supportedLanguages, setSupportedLanguages] = React.useState<string[]>(
    []
  );
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
  const [sidebarSize, setSidebarSize] = React.useState<string>("default");

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
    setSelectedLanguages((prev) => ({
      ...prev,
      [language]: !prev[language],
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
    const script = `git checkout -b Saving && git add . && git commit -m "${fullMessage}" && git checkout main && git merge Saving && git branch -d Saving && git push`;
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
          const newPage =
            !setupCompleted &&
            (hasGitRepository === false || hasGitRepository === null)
              ? "setup"
              : "main";
          setCurrentPage(newPage);
          vscode.setState({
            ...vscode.getState(),
            hasInitialized: true,
            currentPage: newPage,
          });
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

        // Navigate to setup page if no git repository, network is ready, and setup not completed
        if (
          !message.hasGitRepository &&
          isNetworkConnected &&
          !setupCompleted
        ) {
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
            python: message.supportedLanguages.includes("python"),
            java: message.supportedLanguages.includes("java"),
            typescript: message.supportedLanguages.includes("typescript"),
          });
        }
      }
      if (message.type === "setupComplete") {
        console.log("Setup completed:", message);
        if (message.success) {
          // Mark setup as completed
          setSetupCompleted(true);
          // Navigate to main page after successful setup
          setCurrentPage("main");
          vscode.setState({
            ...vscode.getState(),
            currentPage: "main",
            setupCompleted: true,
          });
          // Update git repository status
          setHasGitRepository(true);
        }
      }
      if (message.type === "setSidebarSize") {
        console.log("Setting sidebar size:", message.size);
        setSidebarSize(message.size);
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

  const renderMainPage = () => {
    // Determine container class based on size setting
    const getContainerClass = () => {
      if (sidebarSize === "narrow") return "main-container force-narrow";
      if (sidebarSize === "wide") return "main-container force-wide";
      if (typeof sidebarSize === "number") return "main-container";
      return "main-container";
    };

    const getContainerStyle = () => {
      const baseStyle = {
        fontFamily: "var(--vscode-font-family)",
        padding: "16px",
        minHeight: "100vh",
        background: "var(--vscode-editor-background)",
        width: "100%",
        minWidth: "300px",
      };

      // Apply custom width if it's a number
      if (typeof sidebarSize === "number") {
        return {
          ...baseStyle,
          width: `${sidebarSize}px`,
          minWidth: `${sidebarSize}px`,
          maxWidth: `${sidebarSize}px`,
        };
      }

      return baseStyle;
    };

    return (
      <div className={getContainerClass()} style={getContainerStyle()}>
        {/* Header Section */}
        <div
          style={{
            marginBottom: "24px",
            textAlign: "center",
            borderBottom: "1px solid var(--vscode-widget-border)",
            paddingBottom: "16px",
          }}
        >
          <h2
            style={{
              margin: "0 0 8px 0",
              fontSize: "1.4em",
              fontWeight: "600",
              color: "var(--vscode-foreground)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            PolyCode
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "0.85em",
              color: "var(--vscode-descriptionForeground)",
            }}
          >
            Collaborative Coding Extension
          </p>
        </div>

        {/* Quick Actions Card */}
        <div
          style={{
            background: "var(--vscode-panel-background)",
            border: "1px solid var(--vscode-widget-border)",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "16px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <h3
            style={{
              margin: "0 0 12px 0",
              fontSize: "1em",
              fontWeight: "500",
              color: "var(--vscode-foreground)",
            }}
          >
            Quick Actions
          </h3>
          <div
            className="quick-actions"
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <VSCodeButton
              onClick={navigateToSavePage}
              appearance="primary"
              style={{
                minWidth: "80px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                borderRadius: "6px",
                fontSize: "0.85em",
                flex: "1",
                maxWidth: "120px",
              }}
            >
              Save
            </VSCodeButton>
            <VSCodeButton
              onClick={() =>
                vscode.postMessage({
                  type: "runFile",
                })
              }
              appearance="secondary"
              style={{
                minWidth: "80px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                borderRadius: "6px",
                fontSize: "0.85em",
                flex: "1",
                maxWidth: "120px",
              }}
            >
              Run
            </VSCodeButton>
            <VSCodeButton
              onClick={navigateToSettings}
              appearance="secondary"
              style={{
                minWidth: "80px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                borderRadius: "6px",
                fontSize: "0.85em",
                flex: "1",
                maxWidth: "120px",
              }}
            >
              Settings
            </VSCodeButton>
          </div>
        </div>

        {/* Main Content Grid */}
        <div
          className="main-grid"
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          {/* Connected Users Card */}
          <div
            style={{
              background: "var(--vscode-panel-background)",
              border: "1px solid var(--vscode-widget-border)",
              borderRadius: "8px",
              padding: "16px",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
              minHeight: "200px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: "1em",
                  fontWeight: "500",
                  color: "var(--vscode-foreground)",
                }}
              >
                Connected Users
              </h4>
              <div
                style={{
                  background:
                    connectedUsers.length > 0
                      ? "var(--vscode-inputValidation-infoBackground)"
                      : "var(--vscode-inputValidation-warningBackground)",
                  color:
                    connectedUsers.length > 0
                      ? "var(--vscode-foreground)"
                      : "var(--vscode-inputValidation-errorForeground)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "0.75em",
                  fontWeight: "500",
                }}
              >
                {connectedUsers.length}
              </div>
            </div>
            <div
              className="card-content"
              style={{
                fontFamily: "var(--vscode-editor-font-family)",
                fontSize: "0.9em",
                background: "var(--vscode-editor-background)",
                padding: "12px",
                borderRadius: "6px",
                minHeight: "120px",
                maxHeight: "160px",
                overflow: "auto",
                border: "1px solid var(--vscode-widget-border)",
              }}
            >
              {connectedUsers.length === 0 ? (
                <div
                  style={{
                    color: "var(--vscode-descriptionForeground)",
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: "20px 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ fontSize: "1.5em" }}>●</div>
                  <div>No users connected</div>
                  <div style={{ fontSize: "0.8em" }}>
                    Waiting for collaborators...
                  </div>
                </div>
              ) : (
                connectedUsers.map((user, index) => (
                  <div
                    key={index}
                    style={{
                      padding: "8px 12px",
                      marginBottom: "6px",
                      borderRadius: "6px",
                      backgroundColor:
                        "var(--vscode-inputValidation-infoBackground)",
                      color: "var(--vscode-foreground)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      border:
                        "1px solid var(--vscode-inputValidation-infoBorder)",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor:
                          "var(--vscode-inputValidation-infoForeground)",
                        animation: "pulse 2s infinite",
                      }}
                    ></div>
                    <span style={{ fontWeight: "500" }}>{user}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CRDT Updates Card */}
          <div
            style={{
              background: "var(--vscode-panel-background)",
              border: "1px solid var(--vscode-widget-border)",
              borderRadius: "8px",
              padding: "16px",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
              minHeight: "200px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: "1em",
                  fontWeight: "500",
                  color: "var(--vscode-foreground)",
                }}
              >
                Live Updates
              </h4>
              <div
                style={{
                  background:
                    crdtUpdates.length > 0
                      ? "var(--vscode-inputValidation-infoBackground)"
                      : "var(--vscode-inputValidation-warningBackground)",
                  color:
                    crdtUpdates.length > 0
                      ? "var(--vscode-foreground)"
                      : "var(--vscode-inputValidation-errorForeground)",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "0.75em",
                  fontWeight: "500",
                }}
              >
                {crdtUpdates.length > 9 ? "9+" : crdtUpdates.length}
              </div>
            </div>
            <div
              className="card-content"
              style={{
                fontFamily: "var(--vscode-editor-font-family)",
                fontSize: "0.85em",
                background: "var(--vscode-editor-background)",
                padding: "12px",
                borderRadius: "6px",
                maxHeight: "160px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                border: "1px solid var(--vscode-widget-border)",
              }}
            >
              {crdtUpdates.length === 0 ? (
                <div
                  style={{
                    color: "var(--vscode-descriptionForeground)",
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: "20px 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div style={{ fontSize: "1.5em" }}>●</div>
                  <div>No updates yet</div>
                  <div style={{ fontSize: "0.8em" }}>
                    Start typing to see live collaboration!
                  </div>
                </div>
              ) : (
                crdtUpdates.map((update, index) => (
                  <div key={index}>
                    {update.updates?.map((change: any, changeIndex: number) => (
                      <div
                        key={`${index}-${changeIndex}`}
                        style={{
                          marginBottom: "8px",
                          padding: "12px",
                          border: "1px solid var(--vscode-widget-border)",
                          borderRadius: "8px",
                          backgroundColor:
                            change.operation === "insert"
                              ? "rgba(34, 197, 94, 0.1)"
                              : "var(--vscode-inputValidation-errorBackground)",
                          borderColor:
                            change.operation === "insert"
                              ? "rgba(34, 197, 94, 0.3)"
                              : "var(--vscode-inputValidation-errorBorder)",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        {/* Header with timestamp and file */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "8px",
                            fontSize: "0.75em",
                            color: "var(--vscode-descriptionForeground)",
                          }}
                        >
                          <span style={{ fontWeight: "500" }}>
                            {update.document?.split("/").pop() ||
                              "Unknown file"}
                          </span>
                          <span>
                            {new Date(update.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        {/* Operation indicator */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              backgroundColor:
                                change.operation === "insert"
                                  ? "#22c55e"
                                  : "var(--vscode-inputValidation-errorForeground)",
                            }}
                          />
                          <span
                            style={{
                              fontSize: "0.8em",
                              fontWeight: "600",
                              color:
                                change.operation === "insert"
                                  ? "#22c55e"
                                  : "var(--vscode-inputValidation-errorForeground)",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                            }}
                          >
                            {change.operation === "insert"
                              ? "Added"
                              : "Removed"}
                          </span>
                          <span
                            style={{
                              fontSize: "0.75em",
                              color: "var(--vscode-descriptionForeground)",
                            }}
                          >
                            at line {change.position?.line + 1 || "?"}, col{" "}
                            {change.position?.character + 1 || "?"}
                          </span>
                        </div>

                        {/* Content preview */}
                        <div
                          style={{
                            fontFamily: "var(--vscode-editor-font-family)",
                            fontSize: "0.85em",
                            color: "var(--vscode-foreground)",
                            backgroundColor: "var(--vscode-editor-background)",
                            padding: "8px 12px",
                            borderRadius: "4px",
                            border: "1px solid var(--vscode-widget-border)",
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          {change.operation === "insert" ? (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span
                                style={{
                                  color: "var(--vscode-foreground)",
                                }}
                              >
                                +
                              </span>
                              <code
                                style={{
                                  backgroundColor: "transparent",
                                  color: "var(--vscode-foreground)",
                                  fontSize: "0.9em",
                                  wordBreak: "break-word",
                                }}
                              >
                                {change.text
                                  ? (change.text.length > 50
                                      ? change.text.substring(0, 50) + "..."
                                      : change.text
                                    ).replace(/\n/g, "↵")
                                  : `${change.length || 0} characters`}
                              </code>
                            </div>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span
                                style={{
                                  color:
                                    "var(--vscode-inputValidation-errorForeground)",
                                }}
                              >
                                -
                              </span>
                              <code
                                style={{
                                  backgroundColor: "transparent",
                                  color: "var(--vscode-foreground)",
                                  fontSize: "0.9em",
                                  textDecoration: "line-through",
                                  opacity: 0.7,
                                }}
                              >
                                {change.length || 0} characters removed
                              </code>
                            </div>
                          )}
                        </div>

                        {/* Subtle animation indicator */}
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "3px",
                            height: "100%",
                            backgroundColor:
                              change.operation === "insert"
                                ? "#22c55e"
                                : "var(--vscode-inputValidation-errorForeground)",
                            opacity: 0.8,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div
          style={{
            marginTop: "20px",
            padding: "12px 16px",
            background: "var(--vscode-panel-background)",
            border: "1px solid var(--vscode-widget-border)",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.8em",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: isNetworkConnected
                  ? "#22c55e"
                  : "var(--vscode-inputValidation-errorForeground)",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: isNetworkConnected
                    ? "#22c55e"
                    : "var(--vscode-inputValidation-errorForeground)",
                }}
              ></div>
              {isNetworkConnected ? "Connected" : "Connecting..."}
            </div>
            {dockerConfigured && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "var(--vscode-foreground)",
                }}
              >
                <div
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor:
                      "var(--vscode-inputValidation-infoForeground)",
                  }}
                ></div>
                Docker Ready
              </div>
            )}
          </div>
          <div
            style={{
              color: "var(--vscode-descriptionForeground)",
              fontSize: "0.75em",
            }}
          >
            {userName ? `${userName}` : "Anonymous User"}
          </div>
        </div>

        <style>
          {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          
          /* Sidebar size control */
          .main-container {
            min-width: 300px !important;
          }
          
          /* Panel size control (when opened as full panel) */
          body[data-flavor="panel"] .main-container {
            min-width: 600px !important;
            max-width: 1200px !important;
            margin: 0 auto !important;
          }
          
          /* Responsive breakpoints for VS Code sidebar */
          @media (max-width: 200px) {
            .quick-actions {
              flex-direction: column !important;
              gap: 6px !important;
            }
            .quick-actions button {
              max-width: none !important;
              min-width: 100px !important;
            }
            .main-grid {
              grid-template-columns: 1fr !important;
            }
            .card-content {
              min-height: 150px !important;
            }
          }
          
          @media (max-width: 250px) {
            .quick-actions button {
              min-width: 80px !important;
              height: 28px !important;
              font-size: 0.8em !important;
            }
            .card-content {
              min-height: 120px !important;
            }
          }
          
          @media (min-width: 301px) and (max-width: 500px) {
            .main-grid {
              grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)) !important;
            }
          }
          
          /* Force specific sizes for different contexts */
          .force-narrow {
            width: 280px !important;
            min-width: 280px !important;
            max-width: 280px !important;
          }
          
          .force-wide {
            width: 500px !important;
            min-width: 500px !important;
            max-width: 500px !important;
          }
        `}
        </style>
      </div>
    );
  };

  const renderSavePage = () => (
    <div
      className="save-page-container"
      style={{
        fontFamily: "var(--vscode-font-family)",
        padding: "16px",
        minHeight: "100vh",
        background: "var(--vscode-editor-background)",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Header Section */}
      <div
        style={{
          marginBottom: "24px",
          textAlign: "center",
          borderBottom: "1px solid var(--vscode-widget-border)",
          paddingBottom: "16px",
        }}
      >
        <h2
          style={{
            margin: "0 0 8px 0",
            fontSize: "1.4em",
            fontWeight: "600",
            color: "var(--vscode-foreground)",
          }}
        >
          Save Changes
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: "0.85em",
            color: "var(--vscode-descriptionForeground)",
          }}
        >
          Commit and save your collaborative work
        </p>
      </div>

      {/* Save Form Card */}
      <div
        style={{
          background: "var(--vscode-panel-background)",
          border: "1px solid var(--vscode-widget-border)",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "16px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <div
          className="form-fields"
          style={{
            display: "grid",
            gap: "16px",
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "0.95em",
                fontWeight: "500",
                color: "var(--vscode-foreground)",
              }}
            >
              Commit Title
            </label>
            <div style={{ width: "100%", maxWidth: "100%" }}>
              <VSCodeTextField
                value={commitTitle}
                onInput={(e: any) => setCommitTitle(e.target.value)}
                placeholder="Enter commit title..."
                style={{
                  width: "100%",
                  fontSize: "0.9em",
                }}
              />
            </div>
            <div
              style={{
                fontSize: "0.75em",
                color: "var(--vscode-descriptionForeground)",
                marginTop: "4px",
              }}
            >
              Brief description of your changes
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "0.95em",
                fontWeight: "500",
                color: "var(--vscode-foreground)",
              }}
            >
              Commit Message
            </label>
            <div style={{ width: "100%", maxWidth: "100%" }}>
              <textarea
                value={commitMessage}
                onChange={(e: any) => setCommitMessage(e.target.value)}
                placeholder="Enter detailed commit message..."
                style={{
                  width: "100%",
                  minHeight: "100px",
                  padding: "12px",
                  border: "1px solid var(--vscode-input-border)",
                  borderRadius: "6px",
                  backgroundColor: "var(--vscode-input-background)",
                  color: "var(--vscode-input-foreground)",
                  fontFamily: "var(--vscode-font-family)",
                  fontSize: "0.9em",
                  resize: "vertical",
                  lineHeight: "1.4",
                  boxSizing: "border-box",
                  wordWrap: "break-word",
                  overflowWrap: "break-word",
                  whiteSpace: "pre-wrap",
                  overflowX: "hidden",
                }}
              />
            </div>
            <div
              style={{
                fontSize: "0.75em",
                color: "var(--vscode-descriptionForeground)",
                marginTop: "4px",
              }}
            >
              Optional detailed description of your changes
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          justifyContent: "flex-end",
          marginTop: "16px",
        }}
      >
        <VSCodeButton
          onClick={navigateToMain}
          appearance="secondary"
          style={{
            minWidth: "100px",
            height: "36px",
            borderRadius: "6px",
          }}
        >
          Cancel
        </VSCodeButton>
        <VSCodeButton
          onClick={executeSave}
          appearance="primary"
          style={{
            minWidth: "140px",
            height: "36px",
            borderRadius: "6px",
          }}
        >
          Commit & Save
        </VSCodeButton>
      </div>

      {/* Info Card */}
      <div
        style={{
          background: "var(--vscode-inputValidation-infoBackground)",
          border: "1px solid var(--vscode-inputValidation-infoBorder)",
          borderRadius: "6px",
          padding: "12px",
          marginTop: "16px",
        }}
      >
        <div
          style={{
            fontSize: "0.85em",
            color: "var(--vscode-foreground)",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
          }}
        >
          <div
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              backgroundColor: "var(--vscode-inputValidation-infoForeground)",
              flexShrink: 0,
              marginTop: "2px",
            }}
          ></div>
          <div>
            <div style={{ fontWeight: "500", marginBottom: "4px" }}>
              Git Workflow
            </div>
            <div style={{ fontSize: "0.8em", lineHeight: "1.4" }}>
              Your changes will be committed to a temporary branch, merged to
              main, and pushed to the remote repository.
            </div>
          </div>
        </div>
      </div>

      <style>
        {`
          .save-page-container {
            overflow-x: hidden !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          
          .save-page-container * {
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          
          .save-page-container textarea,
          .save-page-container vscode-text-field,
          .save-page-container input {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            overflow-x: hidden !important;
          }
          
          /* Ensure wrapper divs have consistent sizing */
          .save-page-container .form-fields > div > div {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          
          .save-page-container div {
            max-width: 100% !important;
            overflow-x: hidden !important;
          }
          
          /* Force all form elements to respect container width */
          .save-page-container form,
          .save-page-container .form-card,
          .save-page-container .form-field,
          .save-page-container .form-fields {
            max-width: 100% !important;
            overflow-x: hidden !important;
            box-sizing: border-box !important;
          }
          
          .save-page-container .form-fields * {
            max-width: 100% !important;
            overflow-x: hidden !important;
          }
        `}
      </style>
    </div>
  );

  const renderSettingsPage = () => (
    <div
      style={{
        fontFamily: "var(--vscode-font-family)",
        padding: "16px",
        minHeight: "100vh",
        background: "var(--vscode-editor-background)",
      }}
    >
      {/* Header Section */}
      <div
        style={{
          marginBottom: "24px",
          textAlign: "center",
          borderBottom: "1px solid var(--vscode-widget-border)",
          paddingBottom: "16px",
        }}
      >
        <h2
          style={{
            margin: "0 0 8px 0",
            fontSize: "1.4em",
            fontWeight: "600",
            color: "var(--vscode-foreground)",
          }}
        >
          Settings
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: "0.85em",
            color: "var(--vscode-descriptionForeground)",
          }}
        >
          Configure your PolyCode environment
        </p>
      </div>

      <div
        className="settings-grid"
        style={{
          display: "grid",
          gap: "20px",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        }}
      >
        {/* User Profile Card */}
        <div
          style={{
            background: "var(--vscode-panel-background)",
            border: "1px solid var(--vscode-widget-border)",
            borderRadius: "8px",
            padding: "20px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <h3
            style={{
              margin: "0 0 16px 0",
              fontSize: "1.1em",
              fontWeight: "500",
              color: "var(--vscode-foreground)",
            }}
          >
            User Profile
          </h3>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "0.95em",
                fontWeight: "500",
                color: "var(--vscode-foreground)",
              }}
            >
              Display Name
            </label>
            <VSCodeTextField
              value={userName}
              onInput={(e: any) => setUserName(e.target.value)}
              placeholder="Enter your name..."
              style={{
                width: "100%",
                fontSize: "0.9em",
              }}
            />
            <div
              style={{
                fontSize: "0.75em",
                color: "var(--vscode-descriptionForeground)",
                marginTop: "6px",
              }}
            >
              This name will be shown to other connected users
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
              marginTop: "16px",
            }}
          >
            <VSCodeButton
              onClick={navigateToMain}
              appearance="secondary"
              style={{
                minWidth: "100px",
                height: "36px",
                borderRadius: "6px",
              }}
            >
              Cancel
            </VSCodeButton>
            <VSCodeButton
              onClick={saveUserName}
              appearance="primary"
              style={{
                minWidth: "120px",
                height: "36px",
                borderRadius: "6px",
              }}
            >
              Save Name
            </VSCodeButton>
          </div>
        </div>

        {/* Docker Configuration Card */}
        <div
          style={{
            background: "var(--vscode-panel-background)",
            border: "1px solid var(--vscode-widget-border)",
            borderRadius: "8px",
            padding: "20px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <h3
            style={{
              margin: "0 0 16px 0",
              fontSize: "1.1em",
              fontWeight: "500",
              color: "var(--vscode-foreground)",
            }}
          >
            Docker Configuration
          </h3>

          <div style={{ marginBottom: "16px" }}>
            <VSCodeButton
              onClick={toggleDocker}
              appearance={dockerEnabled ? "primary" : "secondary"}
              style={{
                height: "36px",
                borderRadius: "6px",
                minWidth: "140px",
              }}
            >
              {dockerEnabled ? "Docker Enabled" : "Enable Docker"}
            </VSCodeButton>
            <div
              style={{
                fontSize: "0.75em",
                color: "var(--vscode-descriptionForeground)",
                marginTop: "6px",
              }}
            >
              Enable Docker for secure code execution
            </div>
          </div>

          {dockerEnabled && (
            <div>
              <div
                style={{
                  marginBottom: "12px",
                  fontSize: "0.95em",
                  fontWeight: "500",
                  color: "var(--vscode-foreground)",
                }}
              >
                Supported Languages
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                {[
                  { key: "python", label: "Python" },
                  { key: "java", label: "Java" },
                  { key: "typescript", label: "TypeScript" },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      cursor: "pointer",
                      padding: "8px 12px",
                      border: "1px solid var(--vscode-widget-border)",
                      borderRadius: "6px",
                      backgroundColor: "var(--vscode-input-background)",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--vscode-list-hoverBackground)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--vscode-input-background)";
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedLanguages[key as keyof typeof selectedLanguages]
                      }
                      onChange={() =>
                        toggleLanguage(key as keyof typeof selectedLanguages)
                      }
                      style={{
                        cursor: "pointer",
                        transform: "scale(1.1)",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.9em",
                        fontWeight: "500",
                        color: "var(--vscode-foreground)",
                      }}
                    >
                      {label}
                      {supportedLanguages.includes(key) && (
                        <span
                          style={{
                            fontSize: "0.8em",
                            color: "var(--vscode-foreground)",
                            marginLeft: "8px",
                          }}
                        >
                          (configured)
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              <div
                style={{
                  fontSize: "0.75em",
                  color: "var(--vscode-descriptionForeground)",
                  marginBottom: "16px",
                  padding: "8px 12px",
                  backgroundColor:
                    "var(--vscode-inputValidation-warningBackground)",
                  border:
                    "1px solid var(--vscode-inputValidation-warningBorder)",
                  borderRadius: "4px",
                }}
              >
                {dockerConfigured
                  ? "Changes will rebuild the Docker container with new language support"
                  : "Selected languages will be available for code execution in Docker containers"}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <VSCodeButton
                  onClick={confirmDockerSetup}
                  appearance="primary"
                  disabled={Object.values(selectedLanguages).every(
                    (selected) => !selected
                  )}
                  style={{
                    minWidth: "160px",
                    height: "36px",
                    borderRadius: "6px",
                  }}
                >
                  {dockerConfigured
                    ? "Update Docker Setup"
                    : "Confirm Docker Setup"}
                </VSCodeButton>
              </div>

              {dockerConfigured && containerExists && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 12px",
                    backgroundColor:
                      "var(--vscode-inputValidation-infoBackground)",
                    border:
                      "1px solid var(--vscode-inputValidation-infoBorder)",
                    borderRadius: "6px",
                    fontSize: "0.85em",
                    color: "var(--vscode-foreground)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor:
                        "var(--vscode-inputValidation-infoForeground)",
                    }}
                  ></div>
                  Container ready for execution
                </div>
              )}
            </div>
          )}

          {dockerConfigured && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                backgroundColor: "var(--vscode-inputValidation-infoBackground)",
                border: "1px solid var(--vscode-inputValidation-infoBorder)",
                borderRadius: "6px",
                fontSize: "0.85em",
                color: "var(--vscode-foreground)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor:
                    "var(--vscode-inputValidation-infoForeground)",
                }}
              ></div>
              Docker configuration completed successfully
            </div>
          )}
        </div>
      </div>

      <style>
        {`
          @media (max-width: 400px) {
            .settings-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}
      </style>
    </div>
  );

  const renderLoadingPage = () => (
    <div
      style={{
        fontFamily: "var(--vscode-font-family)",
        padding: "16px",
        minHeight: "100vh",
        background: "var(--vscode-editor-background)",
      }}
    >
      {/* Header Section */}
      <div
        style={{
          marginBottom: "24px",
          textAlign: "center",
          borderBottom: "1px solid var(--vscode-widget-border)",
          paddingBottom: "16px",
        }}
      >
        <h2
          style={{
            margin: "0 0 8px 0",
            fontSize: "1.4em",
            fontWeight: "600",
            color: "var(--vscode-foreground)",
          }}
        >
          Connecting
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: "0.85em",
            color: "var(--vscode-descriptionForeground)",
          }}
        >
          Establishing connection to the PolyCode network
        </p>
      </div>

      {/* Loading Card */}
      <div
        style={{
          background: "var(--vscode-panel-background)",
          border: "1px solid var(--vscode-widget-border)",
          borderRadius: "8px",
          padding: "40px 20px",
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          maxWidth: "400px",
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "3px solid var(--vscode-widget-border)",
              borderTop: "3px solid var(--vscode-button-background)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 20px",
            }}
          />
          <h3
            style={{
              margin: "0 0 12px 0",
              fontSize: "1.1em",
              fontWeight: "500",
              color: "var(--vscode-foreground)",
            }}
          >
            Establishing P2P Connection
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "0.9em",
              color: "var(--vscode-descriptionForeground)",
              lineHeight: "1.4",
            }}
          >
            Connecting to the PolyCode network...
          </p>
        </div>

        <div
          style={{
            fontSize: "0.8em",
            color: "var(--vscode-descriptionForeground)",
            fontStyle: "italic",
            padding: "12px",
            backgroundColor: "var(--vscode-inputValidation-warningBackground)",
            border: "1px solid var(--vscode-inputValidation-warningBorder)",
            borderRadius: "6px",
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
    <div
      style={{
        fontFamily: "var(--vscode-font-family)",
        padding: "16px",
        minHeight: "100vh",
        background: "var(--vscode-editor-background)",
      }}
    >
      {/* Header Section */}
      <div
        style={{
          marginBottom: "24px",
          textAlign: "center",
          borderBottom: "1px solid var(--vscode-widget-border)",
          paddingBottom: "16px",
        }}
      >
        <h2
          style={{
            margin: "0 0 8px 0",
            fontSize: "1.4em",
            fontWeight: "600",
            color: "var(--vscode-foreground)",
          }}
        >
          Setup Required
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: "0.85em",
            color: "var(--vscode-descriptionForeground)",
          }}
        >
          Initialize your PolyCode workspace
        </p>
      </div>

      {/* Setup Card */}
      <div
        style={{
          background: "var(--vscode-panel-background)",
          border: "1px solid var(--vscode-inputValidation-warningBorder)",
          borderRadius: "8px",
          padding: "24px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          maxWidth: "500px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 16px",
            backgroundColor: "var(--vscode-inputValidation-warningBackground)",
            border: "1px solid var(--vscode-inputValidation-warningBorder)",
            borderRadius: "6px",
          }}
        >
          <h4
            style={{
              margin: "0 0 8px 0",
              fontSize: "1em",
              fontWeight: "500",
              color: "var(--vscode-inputValidation-errorForeground)",
            }}
          >
            Git Repository Not Found
          </h4>
          <p
            style={{
              margin: 0,
              fontSize: "0.9em",
              color: "var(--vscode-inputValidation-errorForeground)",
              lineHeight: "1.4",
            }}
          >
            This workspace doesn't contain a git repository. PolyCode requires
            git for collaborative features.
          </p>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "0.95em",
              fontWeight: "500",
              color: "var(--vscode-foreground)",
            }}
          >
            GitHub Repository URL
          </label>
          <VSCodeTextField
            value={githubUrl}
            onInput={(e: any) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/username/repository.git"
            style={{
              width: "100%",
              fontSize: "0.9em",
            }}
          />
          <div
            style={{
              fontSize: "0.75em",
              color: "var(--vscode-descriptionForeground)",
              marginTop: "6px",
              lineHeight: "1.4",
            }}
          >
            Enter the GitHub repository URL to clone and set up this workspace
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <VSCodeButton
            onClick={confirmSetup}
            appearance="primary"
            disabled={!githubUrl.trim()}
            style={{
              minWidth: "140px",
              height: "36px",
              borderRadius: "6px",
            }}
          >
            Confirm Setup
          </VSCodeButton>
        </div>
      </div>

      {/* Info Card */}
      <div
        style={{
          marginTop: "20px",
          background: "var(--vscode-inputValidation-infoBackground)",
          border: "1px solid var(--vscode-inputValidation-infoBorder)",
          borderRadius: "6px",
          padding: "12px",
          maxWidth: "500px",
          margin: "20px auto 0",
        }}
      >
        <div
          style={{
            fontSize: "0.85em",
            color: "var(--vscode-foreground)",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
          }}
        >
          <div
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              backgroundColor: "var(--vscode-inputValidation-infoForeground)",
              flexShrink: 0,
              marginTop: "2px",
            }}
          ></div>
          <div>
            <div style={{ fontWeight: "500", marginBottom: "4px" }}>
              Setup Process
            </div>
            <div style={{ fontSize: "0.8em", lineHeight: "1.4" }}>
              The repository will be cloned to this workspace and configured for
              collaborative development.
            </div>
          </div>
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
