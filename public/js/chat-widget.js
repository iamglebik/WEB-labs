let widgetSocket = null;
let widgetUser = null;
let widgetTicket = null;
let widgetRole = null;
let widgetTypingTimeout = null;
let savedTicketId = null;
let savedUserName = null;

function toggleChatWidget() {
    const widget = document.getElementById('chat-widget');
    if (!widget) return;
    widget.classList.toggle('open');
}

function closeChatWidget() {
    const widget = document.getElementById('chat-widget');
    if (widget) widget.classList.remove('open');
}

function showWidgetRoleForm(role) {
    document.getElementById('widget-login-screen').classList.add('hidden');
    if (role === 'user') {
        document.getElementById('widget-user-form').classList.remove('hidden');
        document.getElementById('widget-operator-form').classList.add('hidden');
    } else {
        document.getElementById('widget-user-form').classList.add('hidden');
        document.getElementById('widget-operator-form').classList.remove('hidden');
    }
}

function backWidgetToLogin() {
    document.getElementById('widget-login-screen').classList.remove('hidden');
    document.getElementById('widget-user-form').classList.add('hidden');
    document.getElementById('widget-operator-form').classList.add('hidden');
}

function connectWidgetToServer() {
    if (widgetSocket) {
        widgetSocket.removeAllListeners();
        widgetSocket.disconnect();
    }
    widgetSocket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });
    setupWidgetSocketListeners();
}

function joinWidgetAsUser() {
    const name = document.getElementById('widget-user-name').value.trim();
    if (!name) {
        alert('Пожалуйста, введите ваше имя');
        return;
    }

    widgetRole = 'user';
    savedUserName = name;
    connectWidgetToServer();

    widgetSocket.on('connect', function() {
        if (savedTicketId) {
            widgetSocket.emit('reconnect_user', { 
                ticketId: savedTicketId, 
                name: savedUserName 
            });
        } else {
            widgetSocket.emit('register', { name: savedUserName, role: 'user' });
        }
    });

    if (widgetSocket.connected) {
        if (savedTicketId) {
            widgetSocket.emit('reconnect_user', { 
                ticketId: savedTicketId, 
                name: savedUserName 
            });
        } else {
            widgetSocket.emit('register', { name: savedUserName, role: 'user' });
        }
    }
}

function joinWidgetAsOperator() {
    const name = document.getElementById('widget-operator-name').value.trim();
    const code = document.getElementById('widget-operator-code').value;

    if (!name) {
        alert('Пожалуйста, введите ваше имя');
        return;
    }
    if (code !== '1234') {
        alert('Неверный код оператора');
        return;
    }

    widgetRole = 'operator';
    savedUserName = name;
    connectWidgetToServer();

    widgetSocket.on('connect', function() {
        widgetSocket.emit('register', { name: savedUserName, role: 'operator' });
    });

    if (widgetSocket.connected) {
        widgetSocket.emit('register', { name: savedUserName, role: 'operator' });
    }
}

function setupWidgetSocketListeners() {
    widgetSocket.on('registered', function(data) {
        if (widgetRole === 'user') {
            widgetUser = {
                id: data.userId,
                name: savedUserName,
                role: 'user'
            };
            widgetTicket = data.ticketId;
            savedTicketId = data.ticketId;

            document.getElementById('widget-user-form').classList.add('hidden');
            showWidgetChatInterface();

            document.getElementById('widget-chat-title').innerText = 'Чат поддержки';
            updateWidgetStatus('waiting', 'Ожидание оператора');
            widgetSocket.emit('get_history', { ticketId: widgetTicket });
        } else if (widgetRole === 'operator') {
            widgetUser = {
                id: data.userId,
                name: savedUserName,
                role: 'operator'
            };

            document.getElementById('widget-operator-form').classList.add('hidden');
            showWidgetChatInterface();

            document.getElementById('widget-chat-title').innerText = 'Панель оператора';
            document.getElementById('widget-operator-name-display').innerText = widgetUser.name;
            document.getElementById('widget-operator-sidebar').classList.remove('hidden');
            document.getElementById('widget-close-ticket-btn').classList.add('hidden');

            updateWidgetStatus('waiting', 'Выберите запрос');
            updateWidgetMessageArea('Выберите запрос из списка');
            widgetSocket.emit('request_tickets');
        }
    });

    widgetSocket.on('reconnected_to_ticket', function(data) {
        if (widgetRole === 'user') {
            widgetUser = { id: data.userId, name: savedUserName, role: 'user' };
            widgetTicket = data.ticketId;
            savedTicketId = data.ticketId;
            updateWidgetStatus(data.status === 'active' ? 'active' : 'waiting', 
                data.status === 'active' ? 'Оператор: ' + (data.operatorName || '') : 'Ожидание оператора');
            enableWidgetMessaging(data.status === 'active');
            widgetSocket.emit('get_history', { ticketId: widgetTicket });
        }
    });

    widgetSocket.on('ticket_created', function(data) {
        if (widgetRole === 'operator') {
            addWidgetNotification('Новый запрос от ' + data.userName);
            widgetSocket.emit('request_tickets');
        }
    });

    widgetSocket.on('tickets_list', function(tickets) {
        updateWidgetTicketsList(tickets);
    });

    widgetSocket.on('ticket_status', function(data) {
        if (data.status === 'active') {
            updateWidgetStatus('active', 'Оператор: ' + data.operatorName);
            enableWidgetMessaging(true);
        } else if (data.status === 'waiting') {
            updateWidgetStatus('waiting', 'Ожидание оператора');
            enableWidgetMessaging(false);
        }
    });

    widgetSocket.on('new_message', function(message) {
        addWidgetMessageToChat(message);
        scrollWidgetToBottom();
    });

    widgetSocket.on('message_history', function(data) {
        displayWidgetMessageHistory(data.messages);
        if (data.status === 'active') {
            updateWidgetStatus('active', 'Активный чат');
            enableWidgetMessaging(true);
        } else if (data.status === 'waiting') {
            updateWidgetStatus('waiting', 'Ожидание оператора');
            enableWidgetMessaging(false);
        } else if (data.status === 'closed') {
            updateWidgetStatus('closed', 'Запрос закрыт');
            enableWidgetMessaging(false);
        }
    });

    widgetSocket.on('user_typing', function(data) {
        showWidgetTypingIndicator(data.userName, data.isTyping);
    });

    widgetSocket.on('ticket_closed', function() {
        updateWidgetStatus('closed', 'Запрос закрыт');
        enableWidgetMessaging(false);
        savedTicketId = null;
        if (widgetRole === 'operator') {
            document.getElementById('widget-close-ticket-btn').classList.add('hidden');
            widgetTicket = null;
        }
        if (widgetRole === 'user') {
            widgetTicket = null;
        }
    });

    widgetSocket.on('operator_joined', function(data) {
        updateWidgetStatus('active', 'Оператор: ' + data.operatorName);
        enableWidgetMessaging(true);
    });

    widgetSocket.on('support_ended', function() {
        savedTicketId = null;
        setTimeout(function() { resetWidgetToLogin(); }, 2000);
    });

    widgetSocket.on('disconnect', function() {
        if (widgetRole === 'user' && savedTicketId) {
            updateWidgetStatus('waiting', 'Восстановление соединения...');
            enableWidgetMessaging(false);
        } else if (widgetRole === 'operator') {
            updateWidgetStatus('waiting', 'Восстановление соединения...');
        }
    });
}

function showWidgetChatInterface() {
    document.getElementById('widget-login-screen').classList.add('hidden');
    document.getElementById('widget-user-form').classList.add('hidden');
    document.getElementById('widget-operator-form').classList.add('hidden');
    document.getElementById('widget-chat-interface').classList.remove('hidden');
    
    if (widgetRole === 'operator') {
        document.getElementById('chat-widget').classList.add('operator-mode');
    }
}

function updateWidgetTicketsList(tickets) {
    const container = document.getElementById('widget-tickets-list');
    if (!tickets || tickets.length === 0) {
        container.innerHTML = '<div class="empty-tickets">Нет активных запросов</div>';
        return;
    }

    container.innerHTML = tickets.map(function(ticket) {
        return '<div class="ticket-item" onclick="selectWidgetTicket(\'' + ticket.id + '\', event)">' +
            '<div class="ticket-name">' + escapeHtmlWidget(ticket.userName) + '</div>' +
            '<div class="ticket-time">' + formatDateWidget(ticket.createdAt) + '</div>' +
        '</div>';
    }).join('');
}

function selectWidgetTicket(ticketId, event) {
    widgetTicket = ticketId;
    widgetSocket.emit('take_ticket', { ticketId: ticketId });

    document.querySelectorAll('#widget-tickets-list .ticket-item').forEach(function(el) {
        el.classList.remove('active');
    });
    if (event && event.target) {
        const item = event.target.closest('.ticket-item');
        if (item) item.classList.add('active');
    }

    updateWidgetStatus('connecting', 'Подключение...');
    document.getElementById('widget-close-ticket-btn').classList.remove('hidden');
    widgetSocket.emit('get_history', { ticketId: ticketId });
}

function updateWidgetStatus(status, text) {
    const statusEl = document.getElementById('widget-chat-status');
    if (!statusEl) return;
    statusEl.className = 'status-badge ' + status;
    statusEl.innerText = text;
}

function enableWidgetMessaging(enabled) {
    const input = document.getElementById('widget-message-input');
    const sendBtn = document.getElementById('widget-send-btn');
    if (input) {
        input.disabled = !enabled;
        input.placeholder = enabled ? 'Введите сообщение...' : 'Чат недоступен';
    }
    if (sendBtn) sendBtn.disabled = !enabled;
}

function sendWidgetMessage() {
    const input = document.getElementById('widget-message-input');
    const message = input.value.trim();
    if (!message || !widgetTicket) return;

    widgetSocket.emit('send_message', {
        ticketId: widgetTicket,
        message: message,
        senderName: widgetUser.name
    });

    input.value = '';
    clearWidgetTypingTimeout();
}

function addWidgetMessageToChat(message) {
    const messagesArea = document.getElementById('widget-messages-area');
    if (!messagesArea) return;

    const isMyMessage = message.senderId === widgetUser?.id;
    const messageClass = isMyMessage ? 'my-message' : (message.senderRole === 'system' ? 'system-message' : 'other-message');

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + messageClass;

    let senderHtml = '';
    if (!isMyMessage && message.senderRole !== 'system') {
        senderHtml = '<div class="message-sender">' + escapeHtmlWidget(message.sender) + '</div>';
    }

    messageDiv.innerHTML = senderHtml +
        '<div class="message-bubble">' + escapeHtmlWidget(message.text) + '</div>' +
        '<div class="message-info">' + formatTimeWidget(message.timestamp) + '</div>';

    messagesArea.appendChild(messageDiv);
    scrollWidgetToBottom();
}

function displayWidgetMessageHistory(messages) {
    const messagesArea = document.getElementById('widget-messages-area');
    if (!messagesArea) return;
    messagesArea.innerHTML = '';

    if (!messages || messages.length === 0) {
        messagesArea.innerHTML = '<div class="welcome-message"><p>💬 Начните общение!</p></div>';
        return;
    }

    messages.forEach(function(message) {
        const isMyMessage = message.senderId === widgetUser?.id;
        const messageClass = isMyMessage ? 'my-message' : (message.senderRole === 'system' ? 'system-message' : 'other-message');

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + messageClass;

        let senderHtml = '';
        if (!isMyMessage && message.senderRole !== 'system') {
            senderHtml = '<div class="message-sender">' + escapeHtmlWidget(message.sender) + '</div>';
        }

        messageDiv.innerHTML = senderHtml +
            '<div class="message-bubble">' + escapeHtmlWidget(message.text) + '</div>' +
            '<div class="message-info">' + formatTimeWidget(message.timestamp) + '</div>';

        messagesArea.appendChild(messageDiv);
    });

    scrollWidgetToBottom();
}

function updateWidgetMessageArea(text) {
    const messagesArea = document.getElementById('widget-messages-area');
    if (messagesArea) {
        messagesArea.innerHTML = '<div class="welcome-message"><p>' + escapeHtmlWidget(text) + '</p></div>';
    }
}

function showWidgetTypingIndicator(userName, isTyping) {
    const indicator = document.getElementById('widget-typing-indicator');
    const typingText = document.getElementById('widget-typing-text');
    if (!indicator || !typingText) return;

    if (isTyping) {
        typingText.innerText = escapeHtmlWidget(userName) + ' печатает...';
        indicator.style.display = 'flex';
    } else {
        indicator.style.display = 'none';
    }
}

function onWidgetTyping() {
    if (!widgetTicket || !widgetUser) return;
    
    const input = document.getElementById('widget-message-input');
    if (input && input.value.trim().length > 0) {
        widgetSocket.emit('typing', { ticketId: widgetTicket, isTyping: true, userName: widgetUser.name });
        clearWidgetTypingTimeout();
        widgetTypingTimeout = setTimeout(function() {
            widgetSocket.emit('typing', { ticketId: widgetTicket, isTyping: false, userName: widgetUser.name });
        }, 2000);
    } else {
        widgetSocket.emit('typing', { ticketId: widgetTicket, isTyping: false, userName: widgetUser.name });
        clearWidgetTypingTimeout();
    }
}

function clearWidgetTypingTimeout() {
    if (widgetTypingTimeout) {
        clearTimeout(widgetTypingTimeout);
        widgetTypingTimeout = null;
    }
}

function closeWidgetTicket() {
    if (!widgetTicket) return;
    if (confirm('Завершить этот диалог?')) {
        widgetSocket.emit('close_ticket', { ticketId: widgetTicket });
        enableWidgetMessaging(false);
        updateWidgetStatus('closed', 'Запрос закрыт');
        document.getElementById('widget-close-ticket-btn').classList.add('hidden');
        savedTicketId = null;

        if (widgetRole === 'user') {
            setTimeout(function() { resetWidgetToLogin(); }, 2000);
        } else {
            widgetTicket = null;
            updateWidgetStatus('waiting', 'Выберите запрос');
            updateWidgetMessageArea('Выберите запрос из списка');
        }
    }
}

function logoutWidget() {
    if (confirm('Выйти из чата?')) {
        if (widgetSocket) {
            widgetSocket.disconnect();
        }
        resetWidgetToLogin();
    }
}

function resetWidgetToLogin() {
    widgetUser = null;
    widgetTicket = null;
    widgetRole = null;
    savedTicketId = null;
    savedUserName = null;
    
    if (widgetSocket) {
        widgetSocket.removeAllListeners();
        widgetSocket.disconnect();
    }

    document.getElementById('chat-widget').classList.remove('operator-mode');
    document.getElementById('widget-chat-interface').classList.add('hidden');
    document.getElementById('widget-operator-sidebar').classList.add('hidden');
    document.getElementById('widget-login-screen').classList.remove('hidden');
    
    const userNameInput = document.getElementById('widget-user-name');
    const operatorNameInput = document.getElementById('widget-operator-name');
    const operatorCodeInput = document.getElementById('widget-operator-code');
    
    if (userNameInput) userNameInput.value = '';
    if (operatorNameInput) operatorNameInput.value = '';
    if (operatorCodeInput) operatorCodeInput.value = '';

    const messagesArea = document.getElementById('widget-messages-area');
    if (messagesArea) {
        messagesArea.innerHTML = '<div class="welcome-message"><p>👋 Добро пожаловать в чат поддержки!</p><p class="small">Выберите роль для начала общения</p></div>';
    }
}

function addWidgetNotification(message) {
    const container = document.getElementById('widget-tickets-list');
    if (!container) return;
    const notification = document.createElement('div');
    notification.style.cssText = 'background: #667eea; color: white; padding: 8px; border-radius: 8px; margin-bottom: 10px;';
    notification.innerText = message;
    container.prepend(notification);
    setTimeout(function() { notification.remove(); }, 3000);
}

function scrollWidgetToBottom() {
    const messagesArea = document.getElementById('widget-messages-area');
    if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
}

function formatDateWidget(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function formatTimeWidget(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtmlWidget(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.addEventListener('beforeunload', function() {
    if (widgetSocket && widgetSocket.connected) {
        widgetSocket.disconnect();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('widget-message-input');
    const sendBtn = document.getElementById('widget-send-btn');
    const logoutBtn = document.getElementById('widget-logout-btn');

    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendWidgetMessage();
            }
        });
        messageInput.addEventListener('input', onWidgetTyping);
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendWidgetMessage);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutWidget);
    }

    const chatBtn = document.getElementById('chat-toggle-btn');
    if (chatBtn) {
        chatBtn.classList.remove('hidden');
    }
});