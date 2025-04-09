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
const vscode = __importStar(require("vscode"));
const ollama_1 = require("ollama");
function activate(context) {
    console.log('"ember-ext" is now active!');
    const ollama = new ollama_1.Ollama({ host: 'http://localhost:11434' });
    let messages = context.globalState.get('chatHistory', []);
    const disposable = vscode.commands.registerCommand('ember-ext.helloWorld', () => {
        const panel = vscode.window.createWebviewPanel('emberChat', 'Ember Seek Chat', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        panel.webview.html = getWebviewContent(messages);
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'chat') {
                const userPrompt = message.text?.trim();
                if (!userPrompt) {
                    panel.webview.postMessage({ command: 'error', text: 'Please enter a question or prompt.' });
                    return;
                }
                messages.push({ role: 'user', content: userPrompt });
                await context.globalState.update('chatHistory', messages);
                panel.webview.postMessage({ command: 'addMessage', message: { role: 'user', content: userPrompt } });
                try {
                    const streamResponse = await ollama.chat({
                        model: 'deepseek-r1:latest',
                        messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
                        stream: true,
                    });
                    let responseText = '';
                    panel.webview.postMessage({ command: 'startTyping' });
                    for await (const part of streamResponse) {
                        responseText += part.message.content;
                        panel.webview.postMessage({ command: 'updateAssistantMessage', text: responseText });
                    }
                    panel.webview.postMessage({ command: 'stopTyping' });
                    messages.push({ role: 'assistant', content: responseText });
                    await context.globalState.update('chatHistory', messages);
                    panel.webview.postMessage({ command: 'finalizeAssistantMessage', message: { role: 'assistant', content: responseText } });
                }
                catch (err) {
                    console.error('Chat error:', err);
                    const errorMessage = `Error: ${err instanceof Error ? err.message : String(err)}`;
                    messages.push({ role: 'assistant', content: errorMessage });
                    await context.globalState.update('chatHistory', messages);
                    panel.webview.postMessage({ command: 'addMessage', message: { role: 'assistant', content: errorMessage } });
                    panel.webview.postMessage({ command: 'stopTyping' });
                }
            }
            else if (message.command === 'clearHistory') {
                messages = [];
                await context.globalState.update('chatHistory', messages);
                panel.webview.postMessage({ command: 'clearMessages' });
            }
        }, undefined, context.subscriptions);
        vscode.window.showInformationMessage('Ember Chat activated!');
    });
    context.subscriptions.push(disposable);
}
function getWebviewContent(messages) {
    const escapeHtml = (unsafe) => {
        return unsafe.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, '');
    };
    const historyHtml = messages.map(msg => `
        <div class="message ${msg.role}" data-role="${msg.role}">
            <div class="bubble">
                <p>${escapeHtml(msg.content)}</p>
            </div>
        </div>
    `).join('');
    return /*html*/ `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' vscode-resource:;">
        <title>Ember Chat</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                background: #0A0A0A;
                color: #F5F5F5;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif;
                display: flex;
                flex-direction: column;
                height: 100vh;
                overflow: hidden;
            }
            #header {
                background: #0A0A0A;
                padding: 12px 24px;
                border-bottom: 1px solid #252525;
                display: flex;
                align-items: center;
                justify-content: space-between;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            #header h1 {
                margin: 0;
                font-size: 18px;
                font-weight: 700;
                color: #F5F5F5;
                letter-spacing: 0.5px;
            }
            #header button {
                background: #252525;
                color: #F5F5F5;
                border: none;
                padding: 6px 14px;
                border-radius: 16px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: background 0.2s;
            }
            #header button:hover {
                background: #333;
            }
            #container {
                flex: 1;
                display: flex;
                flex-direction: column;
                max-width: 900px;
                margin: 0 auto;
                width: 100%;
                padding: 0 24px;
                box-sizing: border-box;
                overflow: hidden;
            }
            #history {
                flex: 1;
                overflow-y: auto;
                padding: 24px 0;
                scrollbar-width: thin;
                scrollbar-color: #444 #0A0A0A;
            }
            #history::-webkit-scrollbar {
                width: 6px;
            }
            #history::-webkit-scrollbar-track {
                background: #0A0A0A;
            }
            #history::-webkit-scrollbar-thumb {
                background: #444;
                border-radius: 3px;
            }
            .message {
                margin: 16px 0;
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
                max-width: 75%;
                padding: 14px 18px;
                border-radius: 20px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                line-height: 1.5;
                font-size: 16px;
            }
            .user .bubble {
                background: #007AFF;
                color: #FFFFFF;
                border-top-right-radius: 8px;
            }
            .assistant .bubble {
                background: #252525;
                color: #F5F5F5;
                border-top-left-radius: 8px;
            }
            .bubble p {
                margin: 0;
                word-wrap: break-word;
            }
            #typing-indicator {
                display: none;
                margin: 16px 18px;
            }
            #typing-indicator.active {
                display: flex;
                align-items: center;
            }
            #typing-indicator span {
                display: inline-block;
                width: 6px;
                height: 6px;
                background: #888;
                border-radius: 50%;
                margin: 0 3px;
                animation: typing 1.2s infinite;
            }
            #typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
            #typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
            @keyframes typing {
                0%, 100% { transform: translateY(0); opacity: 0.6; }
                50% { transform: translateY(-4px); opacity: 1; }
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
            }
            #input-area {
                position: sticky;
                bottom: 0;
                background: #0A0A0A;
                padding: 16px 24px;
                max-width: 900px;
                margin: 0 auto;
                width: 100%;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            #prompt {
                flex: 1;
                padding: 12px 18px;
                background: #252525;
                color: #F5F5F5;
                border: none;
                border-radius: 24px;
                resize: none;
                font-size: 16px;
                line-height: 1.5;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                transition: box-shadow 0.2s;
            }
            #prompt:focus {
                outline: none;
                box-shadow: 0 1px 6px rgba(0, 122, 255, 0.3);
            }
            #askBtn {
                width: 36px;
                height: 36px;
                background: #007AFF;
                color: #FFFFFF;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                line-height: 0;
                transition: background 0.2s;
            }
            #askBtn:hover { background: #005BB5; }
            #askBtn:disabled { background: #444; cursor: not-allowed; }
            #askBtn::after { content: '→'; }
        </style>
    </head>
    <body>
        <div id="header">
            <h1>Ember</h1>
            <button id="clearBtn">Clear Conversation</button>
        </div>
        <div id="container">
            <div id="history">${historyHtml}</div>
            <div id="typing-indicator">
                <span></span><span></span><span></span>
            </div>
            <div id="input-area">
                <textarea id="prompt" rows="1" placeholder="Ask me anything..."></textarea>
                <button id="askBtn"></button>
            </div>
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            const askBtn = document.getElementById('askBtn');
            const clearBtn = document.getElementById('clearBtn');
            const promptEl = document.getElementById('prompt');
            const historyEl = document.getElementById('history');
            const typingIndicator = document.getElementById('typing-indicator');

            historyEl.scrollTop = historyEl.scrollHeight;

            let isNearBottom = true;
            historyEl.addEventListener('scroll', () => {
                const threshold = 50;
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

            promptEl.addEventListener('input', () => {
                promptEl.style.height = 'auto';
                promptEl.style.height = Math.min(promptEl.scrollHeight, 120) + 'px';
            });

            function sendMessage() {
                const text = promptEl.value.trim();
                if (text) {
                    askBtn.disabled = true;
                    promptEl.value = '';
                    promptEl.style.height = 'auto';
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
                div.innerHTML = '<div class="bubble"><p>' + escapeHtml(message.content) + '</p></div>';
                historyEl.appendChild(div);
                scrollToBottom();
            }

            window.addEventListener('message', event => {
                const { command, message, text } = event.data;
                if (command === 'addMessage') {
                    addMessage({ role: message.role, content: escapeHtml(message.content) });
                } else if (command === 'updateAssistantMessage') {
                    let lastMessage = historyEl.querySelector('.message.assistant:last-child p');
                    if (!lastMessage) {
                        const div = document.createElement('div');
                        div.className = 'message assistant';
                        div.dataset.role = 'assistant';
                        div.innerHTML = '<div class="bubble"><p></p></div>';
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
                    addMessage({ role: 'assistant', content: escapeHtml(text) });
                    askBtn.disabled = false;
                }
            });

            function escapeHtml(unsafe) {
                return unsafe.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, '');
            }
        </script>
    </body>
    </html>`;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map