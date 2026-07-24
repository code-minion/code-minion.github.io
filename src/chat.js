import { sendMessage, MAX_TURNS, suggestionForRetryHint } from './llm-client.js';
import { track } from './analytics.js';
import { mountMascot } from './mascot.js';

document.addEventListener('DOMContentLoaded', () => {
    const chatToggle   = document.getElementById('chat-toggle');
    const chatPanel    = document.getElementById('chat-panel');
    const closeChat    = document.getElementById('close-chat');
    const chatInput    = document.getElementById('chat-input');
    const sendBtn      = document.getElementById('chat-send');
    const chatHistory  = document.getElementById('chat-history');
    const speechBubble = document.getElementById('speech-bubble');
    const chatMascot   = document.getElementById('chat-mascot');

    const setMascotState = chatMascot ? mountMascot(chatMascot) : () => {};
    let hasWaved = false;

    // Conversation history for the BFF — array of {role, text}
    // role is 'user' or 'model' (Gemini convention)
    let history = [];
    let contextExhausted = false;
    let currentChipsContainer = null;
    const chatId = crypto.randomUUID();
    const SELF_AWARENESS_CONTEXT = [
        'Context for CODEMINION_AI behavior:',
        '- You are CODEMINION_AI, the AI assistant embedded in code-minion.github.io.',
        "- This chat assistant itself is one of Bradley Chan's real AI applications.",
        "- If asked about Bradley's AI applications, include this chatbot as a concrete example before listing other AI work.",
        '- Keep responses factual and grounded in available CV and project context.'
    ].join('\n');

    const isMobileQuery = window.matchMedia('(max-width: 768px)');
    let isMobile = isMobileQuery.matches;
    isMobileQuery.addEventListener('change', e => {
        isMobile = e.matches;
        updateMobileLayout();
    });

    function updateMobileLayout() {
        if (!isMobile || !chatPanel.classList.contains('open')) {
            chatPanel.classList.remove('mobile-active');
            chatPanel.style.height = '';
            chatPanel.style.top = '';
            document.body.style.overflow = '';
            return;
        }

        chatPanel.classList.add('mobile-active');
        document.body.style.overflow = 'hidden';

        if (window.visualViewport) {
            const vv = window.visualViewport;
            chatPanel.style.height = `${vv.height}px`;
            chatPanel.style.top = `${vv.offsetTop}px`;
        }
    }

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateMobileLayout);
        window.visualViewport.addEventListener('scroll', updateMobileLayout);
    }

    function openChat(source = 'toggle') {
        chatPanel.classList.add('open');
        updateMobileLayout();
        if (speechBubble) {
            speechBubble.style.display = 'none'; // permanently hide after first interaction
        }
        if (!contextExhausted) {
            chatInput.focus();
        }
        if (!hasWaved) {
            hasWaved = true;
            setMascotState('wave');
        }
        track('chat_opened', { source });
    }

    // ---- Toggle open logic (shared by 3d.js and UI) ----
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                if (chatPanel.classList.contains('open') && speechBubble) {
                    speechBubble.style.display = 'none';
                }
            }
        });
    });
    observer.observe(chatPanel, { attributes: true });

    chatToggle.addEventListener('click', () => {
        if (!chatPanel.classList.contains('open')) {
            openChat('toggle');
        } else {
            chatPanel.classList.remove('open');
            updateMobileLayout();
        }
    });

    if (speechBubble) {
        speechBubble.addEventListener('click', () => {
            track('speech_bubble_clicked');
            openChat('bubble');
        });
    }

    closeChat.addEventListener('click', () => {
        chatPanel.classList.remove('open');
        updateMobileLayout();
    });

    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderInlineMarkdown(text) {
        return text
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
            .replace(/`([^`\n]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
            .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    }

    function renderMarkdownToSafeHtml(rawText) {
        const codeBlocks = [];
        const normalized = (rawText || '').replace(/\r\n/g, '\n');
        const withCodePlaceholders = normalized.replace(/```([\s\S]*?)```/g, (_, code) => {
            const token = `@@CODEBLOCK_${codeBlocks.length}@@`;
            codeBlocks.push(code.trim());
            return token;
        });

        const escaped = escapeHtml(withCodePlaceholders);
        const blocks = escaped.split(/\n{2,}/).filter(Boolean);

        const html = blocks.map(block => {
            const lines = block.split('\n').filter(Boolean);
            const isUnorderedList = lines.length > 0 && lines.every(line => /^\s*[-*]\s+/.test(line));
            if (isUnorderedList) {
                const items = lines
                    .map(line => line.replace(/^\s*[-*]\s+/, '').trim())
                    .map(item => `<li>${renderInlineMarkdown(item)}</li>`)
                    .join('');
                return `<ul>${items}</ul>`;
            }

            const isOrderedList = lines.length > 0 && lines.every(line => /^\s*\d+\.\s+/.test(line));
            if (isOrderedList) {
                const items = lines
                    .map(line => line.replace(/^\s*\d+\.\s+/, '').trim())
                    .map(item => `<li>${renderInlineMarkdown(item)}</li>`)
                    .join('');
                return `<ol>${items}</ol>`;
            }

            return `<p>${renderInlineMarkdown(block.replace(/\n/g, '<br>'))}</p>`;
        }).join('');

        return html.replace(/@@CODEBLOCK_(\d+)@@/g, (_, index) => {
            const code = escapeHtml(codeBlocks[Number(index)] || '');
            return `<pre><code>${code}</code></pre>`;
        });
    }

    // ---- Chip Logic ----
    function renderChips(chipsLabels) {
        if (currentChipsContainer) {
            currentChipsContainer.remove();
            currentChipsContainer = null;
        }
        if (!chipsLabels || chipsLabels.length === 0) return;

        const chipsDiv = document.createElement('div');
        chipsDiv.className = 'chat-chips';
        
        chipsLabels.forEach(label => {
            const btn = document.createElement('button');
            btn.className = 'chat-chip';
            btn.innerText = label;
            btn.onclick = () => {
                track('chat_chip_click', { label });
                if (history.length === 0) track('chat_first_message', { type: 'chip' });
                chatInput.value = label;
                handleSend();
            };
            chipsDiv.appendChild(btn);
        });
        
        currentChipsContainer = chipsDiv;
        chatHistory.appendChild(chipsDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function removeChips() {
        if (currentChipsContainer) {
            currentChipsContainer.remove();
            currentChipsContainer = null;
        }
    }

    function parseChips(rawText) {
        const match = rawText.match(/\[CHIPS\](.*?)\[\/CHIPS\]/);
        if (match) {
            return {
                reply: rawText.replace(match[0], '').trim(),
                chips: match[1].split('|').map(s => s.trim())
            };
        }
        return { reply: rawText, chips: [] };
    }

    function getHistoryWithSessionContext() {
        return [{ role: 'user', text: SELF_AWARENESS_CONTEXT }, ...history];
    }

    // Render initial chips
    renderChips(["Send Bradley a message", "What's his tech stack?", "Tell me about his projects"]);

    // ---- Message rendering ----
    function addMessage(text, isUser = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${isUser ? 'user-msg' : 'bot-msg'}`;
        if (isUser) {
            msgDiv.innerText = text;
        } else {
            msgDiv.innerHTML = renderMarkdownToSafeHtml(text);
        }
        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return msgDiv;
    }

    function showContextEnded() {
        contextExhausted = true;
        chatInput.disabled = true;
        sendBtn.disabled = true;
        track('chat_context_exhausted', { turnCount: history.length / 2 });

        const notice = document.createElement('div');
        notice.className = 'context-ended-notice';
        notice.innerHTML = `
            <span class="context-icon">⚠</span>
            <strong>Conversation limit reached.</strong><br>
            This session has ended. Refresh the page to start a new conversation.
            <br><br>
            <button id="refresh-btn" class="refresh-btn">↺ REFRESH</button>
        `;
        chatHistory.appendChild(notice);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        document.getElementById('refresh-btn')?.addEventListener('click', () => location.reload());
    }

    // ---- Send ----
    async function handleSend() {
        if (contextExhausted) return;
        
        const text = chatInput.value.trim();
        if (!text) return;

        if (history.length === 0 && text !== chatInput.value.trim()) {
             // Just keeping the if condition valid, tracking already handled above for chips
        } else if (history.length === 0) {
             track('chat_first_message', { type: 'typed' });
        }

        track('chat_message_sent', { turnNumber: (history.length / 2) + 1 });

        removeChips();

        addMessage(text, true);
        chatInput.value = '';
        chatInput.disabled = true;
        sendBtn.disabled = true;

        const typingDiv = document.createElement('div');
        typingDiv.className = 'chat-msg bot-msg typing-indicator';
        typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        chatHistory.appendChild(typingDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        setMascotState('loading');

        try {
            const historyWithContext = getHistoryWithSessionContext();
            const { reply: rawReply, finishReason } = await sendMessage(text, historyWithContext, chatId);
            
            const { reply, chips } = parseChips(rawReply);

            typingDiv.remove();
            addMessage(reply, false);
            setMascotState('happy');
            if (chips.length > 0) {
                renderChips(chips);
            }

            // Record turn in history
            history.push({ role: 'user',  text });
            history.push({ role: 'model', text: reply });

            // Check context exhaustion: too many turns, or model signalled MAX_TOKENS
            const tooManyTurns = history.length / 2 >= MAX_TURNS;
            const tokenExhausted = finishReason === 'MAX_TOKENS';

            if (tooManyTurns || tokenExhausted) {
                showContextEnded();
                return;
            }

        } catch (e) {
            typingDiv.remove();
            setMascotState('error');
            // Show the backend's user-facing message as-is (it's already written to be
            // shown to a visitor); fall back to a generic notice for unexpected errors
            // instead of leaking raw exception text like "BFF returned 500".
            const baseMessage = e.message && !/^BFF returned \d+$/.test(e.message)
                ? e.message
                : "Sorry, something went wrong on my end. Please try again in a moment.";
            // Append a targeted next step (refresh vs. wait) based on what kind of
            // failure this was, instead of always saying the same generic thing.
            const suggestion = suggestionForRetryHint(e.retryHint);
            addMessage(`${baseMessage}${suggestion}`, false);
            track('chat_error_shown', { retryHint: e.retryHint || 'none' });
        } finally {
            if (!contextExhausted) {
                chatInput.disabled = false;
                sendBtn.disabled = false;
                chatInput.focus();
            }
        }
    }

    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });
    chatInput.addEventListener('input', () => {
        removeChips();
    });
});
