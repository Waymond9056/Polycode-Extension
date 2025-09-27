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
    const flavor = document.getElementById('root')?.dataset?.flavor ?? 'sidebar';
    const [text, setText] = react_1.default.useState('Polycode');
    const toast = (t) => vscode.postMessage({ type: 'toast', text: t });
    const runFormat = () => vscode.postMessage({ type: 'runCommand', command: 'editor.action.formatDocument' });
    return ((0, jsx_runtime_1.jsxs)("div", { style: { fontFamily: 'var(--vscode-font-family)', padding: 12 }, children: [(0, jsx_runtime_1.jsx)("h3", { style: { marginTop: 0 }, children: flavor === 'sidebar' ? 'Polycode Sidebar' : 'Polycode Panel' }), (0, jsx_runtime_1.jsxs)("div", { style: { display: 'grid', gap: 8 }, children: [(0, jsx_runtime_1.jsx)(react_2.VSCodeTextField, { value: text, onInput: (e) => setText(e.target.value), placeholder: "Type something..." }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: () => toast(`Hello from ${text}!`), children: "Say HAIIII" }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: runFormat, appearance: "secondary", children: "Format Document" }), (0, jsx_runtime_1.jsx)(react_2.VSCodeButton, { onClick: () => vscode.postMessage({ type: 'runCommand', command: 'polycode.openPanel' }), children: "Open Panel" })] })] }));
}
(0, client_1.createRoot)(document.getElementById('root')).render((0, jsx_runtime_1.jsx)(App, {}));
//# sourceMappingURL=main.js.map