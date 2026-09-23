import { sendMessage, MAX_TURNS, MAX_PROMPT_CHARS, suggestionForRetryHint } from './llm-client.js';
import { track } from './analytics.js';
import { mountMascot } from './mascot.js';
import { prefetchTurnstileToken, shouldHoldInputForTurnstile, shouldShowTurnstileRecovery } from './turnstile.js';

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

    // Conversation history for the BFF — array of {role, text}
    // role is 'user' or 'model' (Gemini convention)
    let history = [];
    let contextExhausted = false;
    let currentChipsContainer = null;
    const chatId = crypto.randomUUID();

    // The BFF requires a Turnstile token on every send that doesn't already
    // have a server sessionToken, including the first message. Warm one up
    // when the chat opens. Hold the composer only while a later prefetch is
    // still in flight — a failure must not permanently disable it.
    // prefetchStatus: 'idle' | 'pending' | 'ready' | 'failed'
    let turnstileStatus = 'idle';
    let sendInFlight = false;
    let turnstileRecoveryNotice = null;
    // A widget that starts during the open animation or the mobile keyboard
    // resize fails fast. Retry a couple of times before telling the visitor
    // verification failed. The send itself still waits for a real token.
    const QUIET_TURNSTILE_RETRIES = 2;
    let quietRetriesLeft = QUIET_TURNSTILE_RETRIES;
    let quietRetryTimer = null;

    function beginTurnstilePrefetch() {
        if (turnstileStatus === 'pending' || turnstileStatus === 'ready') return;
        if (quietRetryTimer) {
            clearTimeout(quietRetryTimer);
            quietRetryTimer = null;
        }
        turnstileStatus = 'pending';
        applyTurnstileGate();
        prefetchTurnstileToken()
            .then(() => {
                turnstileStatus = 'ready';
                quietRetriesLeft = QUIET_TURNSTILE_RETRIES;
                turnstileRecoveryNotice?.remove();
                turnstileRecoveryNotice = null;
                applyTurnstileGate();
            })
            .catch((err) => {
                turnstileStatus = 'failed';
                applyTurnstileGate();
                const timedOut = String(err?.message || '').includes('timed out');
                if (!timedOut && quietRetriesLeft > 0 && chatPanel.classList.contains('open')) {
                    quietRetriesLeft -= 1;
                    quietRetryTimer = setTimeout(() => {
                        quietRetryTimer = null;
                        if (turnstileStatus === 'failed' && chatPanel.classList.contains('open')) {
                            beginTurnstilePrefetch();
                        }
                    }, 650);
                    return;
                }
                quietRetriesLeft = 0;
                maybeShowTurnstileRecovery();
            });
    }

    // Enables/disables the input based on whether a message-2+ send would need
    // a Turnstile token that isn't ready yet. No-op while a send is already in
    // flight (that has its own disable/enable) or the session has ended.
    // Failed/idle states stay usable so the visitor can retry; sendMessage still
    // requires a token for message #2+.
    function applyTurnstileGate(options = {}) {
        if (contextExhausted || sendInFlight) return;
        const needsVerification = shouldHoldInputForTurnstile(history.length, turnstileStatus);
        if (needsVerification) {
            chatInput.disabled = true;
            sendBtn.disabled = true;
            chatInput.placeholder = 'Verifying your session… one moment';
        } else {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.placeholder = 'Type a message...';
            if (options.focus) chatInput.focus();
        }
    }

    function maybeShowTurnstileRecovery() {
        if (turnstileRecoveryNotice || contextExhausted) return;
        if (!shouldShowTurnstileRecovery(turnstileStatus, history.length, quietRetriesLeft)) return;
        const notice = document.createElement('div');
        notice.className = 'context-ended-notice';
        notice.innerHTML = `
            <span class="context-icon">⚠</span>
            <strong>Session verification failed.</strong><br>
            You can retry, send another message, or refresh the page.
            <br><br>
            <button type="button" id="turnstile-retry-btn" class="refresh-btn">↺ RETRY</button>
            <button type="button" id="turnstile-refresh-btn" class="refresh-btn">REFRESH</button>
        `;
        chatHistory.appendChild(notice);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        turnstileRecoveryNotice = notice;
        track('chat_turnstile_prefetch_failed');

        document.getElementById('turnstile-retry-btn')?.addEventListener('click', () => {
            track('chat_turnstile_retry_clicked');
            notice.remove();
            turnstileRecoveryNotice = null;
            quietRetriesLeft = QUIET_TURNSTILE_RETRIES;
            beginTurnstilePrefetch();
        });
        document.getElementById('turnstile-refresh-btn')?.addEventListener('click', () => location.reload());
    }
    const GAME_HINT_CHIP = '🎮 Wanna play a game?';
    const GAME_HINT_REPLY = "Heh, thought you'd never ask. There's a hidden game somewhere on this site — try the classic cheat code on your keyboard: ↑ ↑ ↓ ↓ ← → ← → B A. Good luck, minion. 🐛";
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

    let viewportRetryTimer = null;
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            updateMobileLayout();
            // The keyboard resizes the sheet under an in-flight widget. Once
            // the viewport settles, try again instead of keeping the failure.
            if (!isMobile || turnstileStatus !== 'failed' || quietRetriesLeft <= 0) return;
            if (!chatPanel.classList.contains('open')) return;
            clearTimeout(viewportRetryTimer);
            viewportRetryTimer = setTimeout(() => {
                if (turnstileStatus === 'failed' && chatPanel.classList.contains('open')) {
                    beginTurnstilePrefetch();
                }
            }, 400);
        });
        window.visualViewport.addEventListener('scroll', updateMobileLayout);
    }

    function whenChatPanelReady(done) {
        requestAnimationFrame(() => requestAnimationFrame(done));
    }

    function focusComposerSoon() {
        if (contextExhausted) return;
        if (!isMobile) {
            chatInput.focus();
            return;
        }
        // Focusing now opens the keyboard and moves the widget mid-challenge.
        // Wait until the token lands, or a short cap, then focus.
        const started = Date.now();
        const tryFocus = () => {
            if (contextExhausted || !chatPanel.classList.contains('open')) return;
            const settled = turnstileStatus === 'ready' || turnstileStatus === 'failed';
            if ((settled || Date.now() - started > 800) && !chatInput.disabled) {
                chatInput.focus();
                return;
            }
            setTimeout(tryFocus, 100);
        };
        setTimeout(tryFocus, 100);
    }

    function openChat(source = 'toggle') {
        chatPanel.classList.add('open');
        updateMobileLayout();
        if (speechBubble) {
            speechBubble.style.display = 'none'; // permanently hide after first interaction
        }
        setMascotState('wave');
        track('chat_opened', { source });
        whenChatPanelReady(() => {
            beginTurnstilePrefetch();
            focusComposerSoon();
        });
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

    // Line-based block parser: headers and horizontal rules are their own lines
    // and often aren't blank-line-separated from surrounding text (models don't
    // reliably add the blank line), so blocks are built line-by-line rather than
    // by splitting on blank lines first.
    function renderMarkdownToSafeHtml(rawText) {
        const codeBlocks = [];
        const normalized = (rawText || '').replace(/\r\n/g, '\n');
        const withCodePlaceholders = normalized.replace(/```([\s\S]*?)```/g, (_, code) => {
            const token = `@@CODEBLOCK_${codeBlocks.length}@@`;
            codeBlocks.push(code.trim());
            return token;
        });

        const escaped = escapeHtml(withCodePlaceholders);
        const lines = escaped.split('\n');

        const htmlParts = [];
        let paragraphLines = [];
        let list = null; // { tag: 'ul'|'ol', items: [] }

        function flushParagraph() {
            if (paragraphLines.length > 0) {
                htmlParts.push(`<p>${renderInlineMarkdown(paragraphLines.join('<br>'))}</p>`);
                paragraphLines = [];
            }
        }
        function flushList() {
            if (list) {
                htmlParts.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`);
                list = null;
            }
        }

        for (const line of lines) {
            if (line.trim() === '') {
                flushParagraph();
                flushList();
                continue;
            }

            const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
            if (headerMatch) {
                flushParagraph();
                flushList();
                const level = headerMatch[1].length;
                htmlParts.push(`<h${level}>${renderInlineMarkdown(headerMatch[2].trim())}</h${level}>`);
                continue;
            }

            if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
                flushParagraph();
                flushList();
                htmlParts.push('<hr>');
                continue;
            }

            const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
            if (ulMatch) {
                flushParagraph();
                if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
                list.items.push(`<li>${renderInlineMarkdown(ulMatch[1].trim())}</li>`);
                continue;
            }

            const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
            if (olMatch) {
                flushParagraph();
                if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
                list.items.push(`<li>${renderInlineMarkdown(olMatch[1].trim())}</li>`);
                continue;
            }

            flushList();
            paragraphLines.push(line);
        }
        flushParagraph();
        flushList();

        const html = htmlParts.join('');
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
                if (label === GAME_HINT_CHIP) {
                    // Handled entirely client-side — no need to burn an LLM call
                    // (or leak the exact key sequence via a system prompt) just to
                    // deliver a fixed hint.
                    removeChips();
                    addMessage(label, true);
                    addMessage(GAME_HINT_REPLY, false);
                    return;
                }
                if (history.length === 0) track('chat_first_message', { type: 'chip' });
                chatInput.value = label;
                handleSend();
            };
            chipsDiv.appendChild(btn);
        });
        
        currentChipsContainer = chipsDiv;
        chatHistory.appendChild(chipsDiv);
        const pinChips = () => { chatHistory.scrollTop = chatHistory.scrollHeight; };
        pinChips();
        requestAnimationFrame(pinChips);
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
        // A response cut off mid-generation (MAX_TOKENS) can leave a dangling,
        // unclosed [CHIPS] marker — strip it rather than showing it as raw text.
        const dangling = rawText.indexOf('[CHIPS]');
        if (dangling !== -1) {
            return { reply: rawText.slice(0, dangling).trim(), chips: [] };
        }
        return { reply: rawText, chips: [] };
    }

    function getHistoryWithSessionContext() {
        return [{ role: 'user', text: SELF_AWARENESS_CONTEXT }, ...history];
    }

    // Render initial chips
    renderChips(["Send Bradley a message", "What's his tech stack?", "Tell me about his projects", GAME_HINT_CHIP]);

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
        // Enter and a click on SEND can both land before either await. Take the
        // slot synchronously so the second submit cannot reuse a one-time
        // Turnstile token (the BFF answers that with 403).
        if (sendInFlight || contextExhausted || shouldHoldInputForTurnstile(history.length, turnstileStatus)) return;

        const text = chatInput.value.trim();
        if (!text) return;

        if (text.length > MAX_PROMPT_CHARS) {
            addMessage('Invalid or oversized prompt', false);
            return;
        }

        const isFirstMessage = history.length === 0;
        sendInFlight = true;
        chatInput.value = '';
        chatInput.disabled = true;
        sendBtn.disabled = true;

        if (isFirstMessage) track('chat_first_message', { type: 'typed' });
        track('chat_message_sent', { turnNumber: (history.length / 2) + 1 });

        removeChips();

        const userBubble = addMessage(text, true);

        const typingDiv = document.createElement('div');
        typingDiv.className = 'chat-msg bot-msg typing-indicator';
        typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        chatHistory.appendChild(typingDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        setMascotState('loading');

        try {
            const historyWithContext = getHistoryWithSessionContext();
            const { reply: rawReply, finishReason, sessionReady } = await sendMessage(text, historyWithContext, chatId, isFirstMessage);

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

            // finishReason === 'MAX_TOKENS' only means *this one reply* got cut off —
            // it says nothing about the conversation as a whole, so it must not end
            // the session. Only running out of turns does that.
            const tooManyTurns = history.length / 2 >= MAX_TURNS;
            if (finishReason === 'MAX_TOKENS') {
                track('chat_response_truncated', { turnNumber: history.length / 2 });
            }

            if (tooManyTurns) {
                showContextEnded();
                return;
            }

            // The token just posted was single-use. A returned session covers
            // the next send; otherwise warm a fresh token for it.
            if (sessionReady) {
                turnstileStatus = 'ready';
                turnstileRecoveryNotice?.remove();
                turnstileRecoveryNotice = null;
            } else {
                turnstileStatus = 'idle';
                beginTurnstilePrefetch();
            }

        } catch (e) {
            typingDiv.remove();
            // The BFF rejected the text itself (oversized / invalid). Drop the
            // optimistic bubble so the transcript isn't left with a message
            // that was never accepted. Put the draft back so it can be edited.
            if (e.retryHint === 'input') {
                userBubble.remove();
                if (!chatInput.value) chatInput.value = text;
            }
            // retryHint 'later' means a real backend/config problem, not something
            // the visitor can fix by retrying — treat that as unrecoverable and
            // leave the mascot showing error instead of reverting to idle.
            const isUnrecoverable = e.retryHint === 'later';
            setMascotState('error', { persistent: isUnrecoverable });
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
            sendInFlight = false;
            applyTurnstileGate({ focus: turnstileStatus !== 'pending' });
            // A prefetch that lost the race with the mobile open can be
            // 'failed' by the time the first reply lands. That reply did not
            // need a token — retry quietly instead of covering it.
            if (turnstileStatus === 'failed') maybeShowTurnstileRecovery();
        }
    }

    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.repeat || e.shiftKey || e.isComposing) return;
        e.preventDefault();
        handleSend();
    });
    chatInput.addEventListener('input', () => {
        removeChips();
    });
});
