import * as vscode from 'vscode';
import * as QRCode from 'qrcode';

/**
 * Initiate pairing: call relay's /api/pair, generate a QR code, and
 * display it in a webview panel. Returns the sessionId on success.
 */
export async function startPairing(
  relayUrl: string,
): Promise<{ sessionId: string; code: string } | null> {
  try {
    const response = await fetch(`${relayUrl}/api/pair`, { method: 'POST' });

    if (!response.ok) {
      vscode.window.showErrorMessage(
        `Pairing failed: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      code: string;
      sessionId: string;
      expiresAt: string;
    };

    await showPairingWebview(relayUrl, data.code, data.expiresAt);

    return { sessionId: data.sessionId, code: data.code };
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `Could not reach relay server at ${relayUrl}: ${err.message}`,
    );
    return null;
  }
}

async function showPairingWebview(
  relayUrl: string,
  code: string,
  expiresAt: string,
): Promise<void> {
  const pairUrl = `${relayUrl}/pair?code=${code}`;
  const qrDataUrl = await QRCode.toDataURL(pairUrl, {
    width: 280,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });

  const panel = vscode.window.createWebviewPanel(
    'remotePairing',
    'Pair with Phone',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  const expiresDate = new Date(expiresAt);
  const expiresStr = expiresDate.toLocaleTimeString();

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pair with Phone</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      text-align: center;
      max-width: 400px;
    }
    .qr { margin: 20px 0; }
    .code {
      font-size: 2.5em;
      font-weight: bold;
      letter-spacing: 0.3em;
      font-family: monospace;
      color: var(--vscode-textLink-foreground);
      margin: 16px 0;
    }
    .hint {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    .url {
      word-break: break-all;
      color: var(--vscode-textLink-foreground);
      font-size: 0.85em;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>📱 Pair with your Phone</h2>
    <p>Scan the QR code or enter the code in your PWA app:</p>
    <div class="qr">
      <img src="${qrDataUrl}" alt="QR Code" width="280" height="280" />
    </div>
    <div class="code">${code}</div>
    <p class="hint">Code expires at ${expiresStr}</p>
    <p class="url">${pairUrl}</p>
  </div>
</body>
</html>`;
}
