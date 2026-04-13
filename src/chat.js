import { sendMessage, MAX_TURNS } from './llm-client.js';
import { track } from './analytics.js';

document.addEventListener('DOMContentLoaded', () => {
    const chatToggle   = document.getElementById('chat-toggle');
    const chatPanel    = document.getElementById('chat-panel');
    const closeChat    = document.getElementById('close-chat');
    const chatInput    = document.getElementById('chat-input');
    const sendBtn      = document.getElementById('chat-send');
    const chatHistory  = document.getElementById('chat-history');
    const speechBubble = document.getElementById('speech-bubble');

    // Conversation history for the BFF — array of {role, text}
    // role is 'user' or 'model' (Gemini convention)
    let history = [];
    let contextExhausted = false;
    let currentChipsContainer = null;
    const chatId = crypto.randomUUID();

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

    // Render initial chips
    renderChips(["Send Bradley a message", "What's his tech stack?", "Tell me about his projects"]);

    // ---- Message rendering ----
    function addMessage(text, isUser = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg ${isUser ? 'user-msg' : 'bot-msg'}`;
        msgDiv.innerText = text;
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

        try {
            const { reply: rawReply, finishReason } = await sendMessage(text, history, chatId);
            
            const { reply, chips } = parseChips(rawReply);

            typingDiv.remove();
            addMessage(reply, false);
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
            addMessage(`[ERROR]: ${e.message}`, false);
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
