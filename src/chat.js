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

    // ---- Toggle ----
    chatToggle.addEventListener('click', () => {
        chatPanel.classList.toggle('open');
        if (chatPanel.classList.contains('open') && !contextExhausted) {
            chatInput.focus();
        }
    });

    closeChat.addEventListener('click', () => chatPanel.classList.remove('open'));

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
        
        // Hide mirror on mobile
        if (mirror) mirror.classList.remove('active');

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

    // ---- Mobile Keyboard & Input Mirror Logic ----
    const mirror = document.getElementById('chat-input-mirror');
    const isMobile = window.matchMedia('(max-width: 768px)');
    
    // Adjust panel position for mobile keyboard
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            if (!isMobile.matches || !chatPanel.classList.contains('open')) return;
            
            const viewport = window.visualViewport;
            const keyboardHeight = window.innerHeight - viewport.height;
            
            if (keyboardHeight > 100) { // Keyboard is likely open
                // Push panel up
                chatPanel.style.bottom = `${keyboardHeight + 10}px`;
                chatPanel.style.height = 'auto';
                chatPanel.style.maxHeight = `${viewport.height - 20}px`;
            } else {
                // Reset to default mobile bottom
                chatPanel.style.bottom = '120px';
                chatPanel.style.height = '65vh';
                chatPanel.style.maxHeight = '500px';
            }
        });
    }

    function updateMirror() {
        if (!isMobile.matches) return;
        const text = chatInput.value;
        if (text) {
            mirror.innerText = text;
            mirror.classList.add('active');
        } else {
            mirror.classList.remove('active');
        }
    }

    chatInput.addEventListener('input', updateMirror);
    
    chatInput.addEventListener('focus', () => {
        if (isMobile.matches && chatInput.value) {
            mirror.classList.add('active');
        }
    });

    chatInput.addEventListener('blur', () => {
        // Delay hide so we don't flash if user quickly taps again
        setTimeout(() => {
            if (document.activeElement !== chatInput) {
                mirror.classList.remove('active');
            }
        }, 200);
    });
});
