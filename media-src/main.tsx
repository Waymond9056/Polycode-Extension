import React from 'react';
import { createRoot } from 'react-dom/client';
import { VSCodeButton, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';

declare global {
  // VS Code injects this into the webview
  function acquireVsCodeApi(): { postMessage: (data: unknown) => void; getState: () => any; setState: (s: any) => void };
}

const vscode = acquireVsCodeApi();

function App() {
  const flavor = (document.getElementById('root') as HTMLElement)?.dataset?.flavor ?? 'sidebar';
  const [text, setText] = React.useState('Polycode');

  const toast = (t: string) => vscode.postMessage({ type: 'toast', text: t });
  const runFormat = () => vscode.postMessage({ type: 'runCommand', command: 'editor.action.formatDocument' });

  return (
    <div style={{ fontFamily: 'var(--vscode-font-family)', padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>{flavor === 'sidebar' ? 'Polycode Sidebar' : 'Polycode Panel'}</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        <VSCodeTextField value={text} onInput={(e:any) => setText(e.target.value)} placeholder="Type something..." />
        <VSCodeButton onClick={() => toast(`Hello from ${text}!`)}>Say HAI</VSCodeButton>
        <VSCodeButton onClick={runFormat} appearance="secondary">Format Document</VSCodeButton>
        <VSCodeButton onClick={() => vscode.postMessage({ type: 'runCommand', command: 'polycode.openPanel' })}>
          Open Panel
        </VSCodeButton>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
