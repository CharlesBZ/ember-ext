import * as vscode from 'vscode';
import { Ollama } from 'ollama';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('"ember-ext" is now active!');

    const ollama = new Ollama({ host: 'http://localhost:11434' });
    let messages: ChatMessage[] = context.globalState.get('chatHistory', []) as ChatMessage[];

    const disposable = vscode.commands.registerCommand('ember-ext.helloWorld', () => {
        const panel = vscode.window.createWebviewPanel(
            'emberChat',
            'Ember Seek Chat',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getWebviewContent(messages);

        panel.webview.onDidReceiveMessage(
            async (message: { command: string; text: string }) => {
                if (message.command === 'chat') {
                    const userPrompt = message.text.trim();
                    if (!userPrompt) {
                        panel.webview.postMessage({
                            command: 'chatResponse',
                            text: 'Please enter a question or prompt.'
                        });
                        return;
                    }

                    // Add user message to history
                    messages.push({ role: 'user', content: userPrompt });
                    await context.globalState.update('chatHistory', messages);
                    // Update webview and notify to scroll to bottom
                    panel.webview.html = getWebviewContent(messages);
                    panel.webview.postMessage({ command: 'scrollToBottom' });

                    try {
                        const streamResponse = await ollama.chat({
                            model: 'deepseek-r1:latest',
                            messages: messages.map(msg => ({
                                role: msg.role,
                                content: msg.content
                            })),
                            stream: true,
                        });

                        let responseText = '';
                        for await (const part of streamResponse) {
                            responseText += part.message.content;
                            // Send partial response and request scroll
                            panel.webview.postMessage({
                                command: 'chatResponse',
                                text: responseText
                            });
                            panel.webview.postMessage({ command: 'scrollToBottom' });
                        }

                        // Add assistant response to history
                        messages.push({ role: 'assistant', content: responseText });
                        await context.globalState.update('chatHistory', messages);
                        panel.webview.html = getWebviewContent(messages);
                        panel.webview.postMessage({ command: 'scrollToBottom' });

                    } catch (err) {
                        console.error('Chat error:', err);
                        const errorMessage = `Error: ${err instanceof Error ? err.message : String(err)}`;
                        messages.push({ role: 'assistant', content: errorMessage });
                        await context.globalState.update('chatHistory', messages);
                        panel.webview.html = getWebviewContent(messages);
                        panel.webview.postMessage({
                            command: 'chatResponse',
                            text: errorMessage
                        });
                        panel.webview.postMessage({ command: 'scrollToBottom' });
                    }
                } else if (message.command === 'clearHistory') {
                    messages = [];
                    await context.globalState.update('chatHistory', messages);
                    panel.webview.html = getWebviewContent(messages);
                    panel.webview.postMessage({ command: 'scrollToBottom' });
                }
            },
            undefined,
            context.subscriptions
        );

        vscode.window.showInformationMessage('Ember Chat activated!');
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent(messages: ChatMessage[]): string {
    const escapeHtml = (unsafe: string) => {
        return unsafe
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '');
    };

    const historyHtml = messages
        .map(
            msg => `
                <div class="message ${msg.role}">
                    <strong>${msg.role === 'user' ? 'You' : 'Assistant'}:</strong>
                    <p>${escapeHtml(msg.content)}</p>
                </div>
            `
        )
        .join('');

    return /*html*/`<!DOCTYPE html>
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
            #askBtn, #clearBtn {
                margin: 0.5rem 0.5rem 0.5rem 0;
                padding: 5px 15px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                cursor: pointer;
            }
            #askBtn:hover, #clearBtn:hover {
                background: var(--vscode-button-hoverBackground);
            }
            #history {
                border: 1px solid var(--vscode-panel-border);
                margin-top: 1rem;
                padding: 0.5rem;
                min-height: 100px;
                max-height: 400px;
                overflow-y: auto;
                white-space: pre-wrap;
                background: var(--vscode-editor-background);
            }
            .message {
                margin: 0.5rem 0;
            }
            .user {
                text-align: right;
            }
            .assistant {
                text-align: left;
            }
            .message p {
                margin: 0.2rem 0;
            }
        </style>
    </head>
    <body>
        <h2>Ember VS Code Extension</h2>
        <textarea id="prompt" rows="3" placeholder="Ask something..."></textarea><br />
        <button id="askBtn">Ask</button>
        <button id="clearBtn">Clear History</button>
        <div id="history">${historyHtml}</div>

        <script>
            const vscode = acquireVsCodeApi();
            const askBtn = document.getElementById('askBtn');
            const clearBtn = document.getElementById('clearBtn');
            const promptEl = document.getElementById('prompt');
            const historyEl = document.getElementById('history');

            // Initialize scroll position to bottom on load
            historyEl.scrollTop = historyEl.scrollHeight;

            askBtn.addEventListener('click', sendMessage);
            promptEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            clearBtn.addEventListener('click', () => {
                vscode.postMessage({ command: 'clearHistory' });
            });

            function sendMessage() {
                const text = promptEl.value.trim();
                if (text) {
                    askBtn.disabled = true;
                    promptEl.value = '';
                    vscode.postMessage({ command: 'chat', text });
                    // Scroll to bottom immediately
                    historyEl.scrollTop = historyEl.scrollHeight;
                }
            }

            window.addEventListener('message', event => {
                const { command, text } = event.data;
                if (command === 'chatResponse') {
                    // Update the last assistant message dynamically
                    const lastMessage = historyEl.querySelector('.message.assistant:last-child p');
                    if (lastMessage) {
                        lastMessage.textContent = text;
                    } else {
                        // If no assistant message exists, create one (for errors or initial response)
                        const newMessage = document.createElement('div');
                        newMessage.className = 'message assistant';
                        newMessage.innerHTML = '<strong>Assistant:</strong><p>' + text + '</p>';
                        historyEl.appendChild(newMessage);
                    }
                    askBtn.disabled = false;
                    historyEl.scrollTop = historyEl.scrollHeight;
                } else if (command === 'scrollToBottom') {
                    historyEl.scrollTop = historyEl.scrollHeight;
                }
            });
        </script>
    </body>
    </html>`;
}

export function deactivate() {}