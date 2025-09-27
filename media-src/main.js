"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importDefault(require("react"));
const client_1 = require("react-dom/client");
const react_2 = require("@vscode/webview-ui-toolkit/react");
const vscode = acquireVsCodeApi();
function App() {
    const flavor = document.getElementById("root")?.dataset?.flavor ??
        "sidebar";
    const [text, setText] = react_1.default.useState("Polycode");
    const [editorContent, setEditorContent] = react_1.default.useState("No editor content");
    const toast = (t) => vscode.postMessage({ type: "toast", text: t });
    const runFormat = () => vscode.postMessage({
        type: "runCommand",
        command: "editor.action.formatDocument",
    });
    const insertText = (text) => {
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
    // Listen for messages from the extension using VS Code webview API
    react_1.default.useEffect(() => {
        const handleMessage = (message) => {
            console.log("Received message:", message);
            if (message.type === "editorContent") {
                console.log("Setting editor content:", message.content);
                setEditorContent(message.content || "No content");
            }
            if (message.type === "testResponse") {
                console.log("Test response received:", message.data);
                setEditorContent("Connection working! " + message.data);
            }
        };
        // VS Code webview message handling - use the proper API
        const messageListener = (event) => {
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
    return ((0, jsx_runtime_1.jsxs)("div", { style: { fontFamily: "var(--vscode-font-family)", padding: 12 }, children: [(0, jsx_runtime_1.jsx)("h3", { style: { marginTop: 0 }, children: flavor === "sidebar" ? "Polycode Sidebar" : "Polycode Panel" }), (0, jsx_runtime_1.jsxs)("div", { style: { display: "grid", gap: 8 }, children: [(0, jsx_runtime_1.jsx)(react_2.VSCodeTextField, { value: text, onInput: (e) => setText(e.target.value), placeholder: "Type something..." }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: () => toast(`Hello from ${text}!`), children: "Say" }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: runFormat, appearance: "secondary", children: "Format Document" }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: () => vscode.postMessage({
                            type: "runCommand",
                            command: "polycode.openPanel",
                        }), children: "Open Panel" }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: () => insertText("hello"), children: "WRITE HI" }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: () => vscode.postMessage({ type: "toast", text: "Button clicked!" }), children: "SIMPLE TEST" }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: () => {
                            console.log("Testing vscode API...");
                            console.log("vscode object:", vscode);
                            vscode.postMessage({ type: "toast", text: "Direct test" });
                        }, children: "DIRECT TEST" }), (0, jsx_runtime_1.jsxs)("div", { style: {
                            border: "1px solid var(--vscode-widget-border)",
                            padding: 8,
                            borderRadius: 4,
                        }, children: [(0, jsx_runtime_1.jsx)("h4", { style: { margin: "0 0 8px 0" }, children: "Current Editor Content:" }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: getEditorContent, appearance: "secondary", style: { marginBottom: 8 }, children: "Refresh Content" }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: testConnection, appearance: "secondary", style: { marginBottom: 8 }, children: "Test Connection" }), (0, jsx_runtime_1.jsx)("div", { style: {
                                    fontFamily: "var(--vscode-editor-font-family)",
                                    fontSize: "var(--vscode-editor-font-size)",
                                    background: "var(--vscode-editor-background)",
                                    padding: 8,
                                    borderRadius: 4,
                                    maxHeight: 200,
                                    overflow: "auto",
                                    whiteSpace: "pre-wrap",
                                }, children: editorContent })] })] })] }));
}
(0, client_1.createRoot)(document.getElementById("root")).render((0, jsx_runtime_1.jsx)(App, {}));
//# sourceMappingURL=main.js.map