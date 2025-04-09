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

        // Initialize webview with current history
        panel.webview.html = getWebviewContent(messages);

        panel.webview.onDidReceiveMessage(
            async (message: { command: string; text?: string; messages?: ChatMessage[] }) => {
                if (message.command === 'chat') {
                    const userPrompt = message.text?.trim();
                    if (!userPrompt) {
                        panel.webview.postMessage({
                            command: 'error',
                            text: 'Please enter a question or prompt.'
                        });
                        return;
                    }

                    // Add user message to history
                    messages.push({ role: 'user', content: userPrompt });
                    await context.globalState.update('chatHistory', messages);
                    // Send updated messages to webview instead of regenerating HTML
                    panel.webview.postMessage({
                        command: 'addMessage',
                        message: { role: 'user', content: userPrompt }
                    });

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
                        panel.webview.postMessage({ command: 'startTyping' });
                        for await (const part of streamResponse) {
                            responseText += part.message.content;
                            panel.webview.postMessage({
                                command: 'updateAssistantMessage',
                                text: responseText
                            });
                        }
                        panel.webview.postMessage({ command: 'stopTyping' });

                        // Add assistant response to history
                        messages.push({ role: 'assistant', content: responseText });
                        await context.globalState.update('chatHistory', messages);
                        panel.webview.postMessage({
                            command: 'finalizeAssistantMessage',
                            message: { role: 'assistant', content: responseText }
                        });

                    } catch (err) {
                        console.error('Chat error:', err);
                        const errorMessage = `Error: ${err instanceof Error ? err.message : String(err)}`;
                        messages.push({ role: 'assistant', content: errorMessage });
                        await context.globalState.update('chatHistory', messages);
                        panel.webview.postMessage({
                            command: 'addMessage',
                            message: { role: 'assistant', content: errorMessage }
                        });
                        panel.webview.postMessage({ command: 'stopTyping' });
                    }
                } else if (message.command === 'clearHistory') {
                    messages = [];
                    await context.globalState.update('chatHistory', messages);
                    panel.webview.postMessage({ command: 'clearMessages' });
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
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const historyHtml = messages
        .map(
            msg => `
                <div class="message ${msg.role}" data-role="${msg.role}">
                    <div class="bubble">
                        <strong>${msg.role === 'user' ? 'You' : 'Assistant'}:</strong>
                        <p>${escapeHtml(msg.content)}</p>
                    </div>
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
                margin: 0;
                padding: 0;
                background: #1a1a1a;
                color: #e0e0e0;
                font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Roboto', sans-serif;
                display: flex;
                flex-direction: column;
                height: 100vh;
                overflow: hidden;
            }
            #container {
                flex: 1;
                display: flex;
                flex-direction: column;
                max-width: 800px;
                margin: 0 auto;
                width: 100%;
                padding: 20px;
                box-sizing: border-box;
            }
            #history {
                flex: 1;
                overflow-y: auto;
                padding-bottom: 20px;
                scrollbar-width: thin;
                scrollbar-color: #444 #2a2a2a;
            }
            #history::-webkit-scrollbar {
                width: 8px;
            }
            #history::-webkit-scrollbar-track {
                background: #2a2a2a;
            }
            #history::-webkit-scrollbar-thumb {
                background: #444;
                border-radius: 4px;
            }
            .message {
                margin: 10px 0;
                display: flex;
                animation: fadeIn 0.3s ease-in;
            }
            .user {
                justify-content: flex-end;
            }
            .assistant {
                justify-content: flex-start;
            }
            .bubble {
                max-width: 70%;
                padding: 10px 15px;
                border-radius: 15px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                line-height: 1.4;
            }
            .user .bubble {
                background: #0078d4;
                color: #fff;
            }
            .assistant .bubble {
                background: #333;
                color: #e0e0e0;
            }
            .bubble strong {
                font-weight: 600;
                display: block;
                margin-bottom: 5px;
            }
            .bubble p {
                margin: 0;
                word-wrap: break-word;
            }
            #typing-indicator {
                display: none;
                margin: 10px 15px;
                color: #888;
            }
            #typing-indicator.active {
                display: block;
            }
            #typing-indicator span {
                display: inline-block;
                width: 8px;
                height: 8px;
                background: #888;
                border-radius: 50%;
                margin: 0 2px;
                animation: typing 1s infinite;
            }
            #typing-indicator span:nth-child(2) {
                animation-delay: 0.2s;
            }
            #typing-indicator span:nth-child(3) {
                animation-delay: 0.4s;
            }
            @keyframes typing {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            #input-area {
                position: sticky;
                bottom: 0;
                background: #1a1a1a;
                padding: 15px 20px;
                border-top: 1px solid #2a2a2a;
                max-width: 800px;
                margin: 0 auto;
                width: 100%;
                box-sizing: border-box;
            }
            #prompt {
                width: 100%;
                padding: 10px 15px;
                background: #2a2a2a;
                color: #e0e0e0;
                border: none;
                border-radius: 20px;
                resize: none;
                font-size: 16px;
                line-height: 1.5;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                transition: box-shadow 0.2s;
            }
            #prompt:focus {
                outline: none;
                box-shadow: 0 2px 8px rgba(0, 120, 212, 0.3);
            }
            #buttons {
                margin-top: 10px;
                text-align: right;
            }
            #askBtn, #clearBtn {
                padding: 8px 15px;
                margin-left: 10px;
                background: #0078d4;
                color: #fff;
                border: none;
                border-radius: 15px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }
            #askBtn:hover, #clearBtn:hover {
                background: #005ea2;
            }
            #askBtn:disabled {
                background: #444;
                cursor: not-allowed;
            }
        </style>
    </head>
    <body>
        <div id="container">
            <div id="history">${historyHtml}</div>
            <div id="typing-indicator">
                <span></span><span></span><span></span>
            </div>
            <div id="input-area">
                <textarea id="prompt" rows="2" placeholder="Ask anything..."></textarea>
                <div id="buttons">
                    <button id="askBtn">Ask</button>
                    <button id="clearBtn">Clear History</button>
                </div>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const askBtn = document.getElementById('askBtn');
            const clearBtn = document.getElementById('clearBtn');
            const promptEl = document.getElementById('prompt');
            const historyEl = document.getElementById('history');
            const typingIndicator = document.getElementById('typing-indicator');

            // Initialize scroll position
            historyEl.scrollTop = historyEl.scrollHeight;

            // Track if user is near bottom to auto-scroll
            let isNearBottom = true;
            historyEl.addEventListener('scroll', () => {
                const threshold = 50; // Pixels from bottom
                isNearBottom = historyEl.scrollHeight - historyEl.scrollTop - historyEl.clientHeight < threshold;
            });

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
                }
            }

            function scrollToBottom() {
                if (isNearBottom) {
                    historyEl.scrollTop = historyEl.scrollHeight;
                }
            }

            function addMessage(message) {
                const div = document.createElement('div');
                div.className = 'message ' + message.role;
                div.dataset.role = message.role;
                div.innerHTML = '<div class="bubble"><strong>' + 
                    (message.role === 'user' ? 'You' : 'Assistant') + 
                    ':</strong><p>' + message.content + '</p></div>';
                historyEl.appendChild(div);
                scrollToBottom();
            }

            window.addEventListener('message', event => {
                const { command, message, text } = event.data;
                if (command === 'addMessage') {
                    addMessage({
                        role: message.role,
                        content: escapeHtml(message.content)
                    });
                } else if (command === 'updateAssistantMessage') {
                    let lastMessage = historyEl.querySelector('.message.assistant:last-child p');
                    if (!lastMessage) {
                        const div = document.createElement('div');
                        div.className = 'message assistant';
                        div.dataset.role = 'assistant';
                        div.innerHTML = '<div class="bubble"><strong>Assistant:</strong><p></p></div>';
                        historyEl.appendChild(div);
                        lastMessage = div.querySelector('p');
                    }
                    lastMessage.textContent = text;
                    scrollToBottom();
                } else if (command === 'finalizeAssistantMessage') {
                    const lastMessage = historyEl.querySelector('.message.assistant:last-child p');
                    if (lastMessage) {
                        lastMessage.textContent = escapeHtml(message.content);
                    }
                    scrollToBottom();
                } else if (command === 'clearMessages') {
                    while (historyEl.firstChild) {
                        historyEl.removeChild(historyEl.firstChild);
                    }
                    typingIndicator.classList.remove('active');
                    scrollToBottom();
                } else if (command === 'startTyping') {
                    typingIndicator.classList.add('active');
                    scrollToBottom();
                } else if (command === 'stopTyping') {
                    typingIndicator.classList.remove('active');
                    scrollToBottom();
                } else if (command === 'error') {
                    addMessage({
                        role: 'assistant',
                        content: escapeHtml(text)
                    });
                    askBtn.disabled = false;
                }
            });

            function escapeHtml(unsafe) {
                return unsafe
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }
        </script>
    </body>
    </html>`;
}

export function deactivate() {}