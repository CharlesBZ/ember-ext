"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const ollama_1 = require("ollama");
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('"ember-ext" is now active!');
    // Initialize Ollama
    const ollama = new ollama_1.Ollama({
        host: "http://localhost:11434", // Default Ollama host, adjust if needed
    });
    // Test connection
    ollama
        .list()
        .then((models) => {
        console.log("Available models:", models);
    })
        .catch((err) => {
        console.error("Ollama connection error:", err);
    });
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand("ember-ext.helloWorld", () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        const panel = vscode.window.createWebviewPanel("emberChat", "Ember Seek Chat", vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true, // Keeps webview state when hidden
        });
        panel.webview.html = getWebviewContent();
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === "chat") {
                const userPrompt = message.text;
                let responseText = "";
                try {
                    const streamResponse = await ollama.chat({
                        model: "deepseek-r1:latest",
                        messages: [{ role: "user", content: userPrompt }],
                        stream: true,
                    });
                    for await (const part of streamResponse) {
                        responseText += part.message.content;
                        panel.webview.postMessage({
                            command: "chatResponse",
                            text: responseText,
                        });
                    }
                }
                catch (err) {
                    panel.webview.postMessage({
                        command: "chatResponse",
                        text: `Error: ${String(err)}`,
                    });
                }
            }
        });
        vscode.window.showErrorMessage("Hello World from ember-ext!");
    });
    context.subscriptions.push(disposable);
}
function getWebviewContent() {
    // You can use a webview to create a custom UI for your extension
    return /*html*/ `<!DOCTYPE html>
	<html lang="en">
	<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' vscode-resource:;">
			<title>Ember Seek Chat</title>
			<style>
					body { 
							font-family: var(--vscode-font-family, sans-serif); 
							margin: 1rem; 
							background: var(--vscode-editor-background); 
							color: var(--vscode-foreground);
					}
					#prompt { 
							width: 100%; 
							box-sizing: border-box; 
							resize: vertical;
							padding: 8px;
							background: var(--vscode-input-background);
							color: var(--vscode-input-foreground);
							border: 1px solid var(--vscode-input-border);
					}
					#askBtn {
							margin: 0.5rem 0;
							padding: 5px 15px;
							background: var(--vscode-button-background);
							color: var(--vscode-button-foreground);
							border: none;
							cursor: pointer;
					}
					#askBtn:hover {
							background: var(--vscode-button-hoverBackground);
					}
					#response { 
							border: 1px solid var(--vscode-panel-border); 
							margin-top: 1rem; 
							padding: 0.5rem; 
							min-height: 100px; 
							white-space: pre-wrap;
							background: var(--vscode-editor-background);
					}
			</style>
	</head>
	<body>
			<h2>Ember VS Code Extension</h2>
			<textarea id="prompt" rows="3" placeholder="Ask something..."></textarea><br />
			<button id="askBtn">Ask</button>
			<div id="response"></div>

			<script>
					const vscode = acquireVsCodeApi();
					const askBtn = document.getElementById('askBtn');
					const promptEl = document.getElementById('prompt');
					
					askBtn.addEventListener('click', sendMessage);
					promptEl.addEventListener('keypress', (e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									sendMessage();
							}
					});

					function sendMessage() {
							const text = promptEl.value.trim();
							if (text) {
									askBtn.disabled = true;
									vscode.postMessage({ command: 'chat', text });
							}
					}

					window.addEventListener('message', event => {
							const { command, text } = event.data;
							if (command === 'chatResponse') {
									document.getElementById('response').textContent = text;
									askBtn.disabled = false;
							}
					});
			</script>
	</body>
	</html>`;
}
// This method is called when your extension is deactivated
function deactivate() { }
//# sourceMappingURL=extension.js.map