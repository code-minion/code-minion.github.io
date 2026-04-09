import { sendMessage, MAX_TURNS } from './llm-client.js';

document.addEventListener('DOMContentLoaded', () => {
    const chatToggle  = document.getElementById('chat-toggle');
    const chatPanel   = document.getElementById('chat-panel');
    const closeChat   = document.getElementById('close-chat');
    const chatInput   = document.getElementById('chat-input');
    const sendBtn     = document.getElementById('chat-send');
    const chatHistory = document.getElementById('chat-history');

    // Conversation history for the BFF — array of {role, text}
    // role is 'user' or 'model' (Gemini convention)
    let history = [];
    let contextExhausted = false;
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

    // ---- Toggle ----
    chatToggle.addEventListener('click', () => {
        chatPanel.classList.toggle('open');
        updateMobileLayout();
        
        if (chatPanel.classList.contains('open') && !contextExhausted) {
            chatInput.focus();
        }
    });

    closeChat.addEventListener('click', () => {
        chatPanel.classList.remove('open');
        updateMobileLayout();
    });

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
            const { reply, finishReason } = await sendMessage(text, history, chatId);

            typingDiv.remove();
            addMessage(reply, false);

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
});
