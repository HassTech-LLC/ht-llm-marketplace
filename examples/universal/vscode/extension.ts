import * as vscode from "vscode";

const baseUrl = "http://127.0.0.1:3001/v1";
const chatCompletionsPath = "/v1/chat/completions";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("htlm.askLocalModel", async () => {
    const prompt = await vscode.window.showInputBox({ prompt: "Ask the local model" });
    if (!prompt) return;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer local-not-needed"
      },
      body: JSON.stringify({
        model: "local",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      vscode.window.showErrorMessage(`HTLM request failed: ${response.status}`);
      return;
    }

    const payload = await response.json();
    vscode.window.showInformationMessage(payload.choices?.[0]?.message?.content || "No response");
  });

  context.subscriptions.push(disposable);
}

// Use htlm status/search/downloads/verify/load from the integrated terminal for lifecycle actions.
