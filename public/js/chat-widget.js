let widgetSocket = null;
let widgetUser = null;
let widgetTicket = null;
let widgetRole = null;
let widgetTypingTimeout = null;

function toggleChatWidget() {
    var widget = document.getElementById('chat-widget');
    if (!widget) return;
    widget.classList.toggle('open');
}

function closeChatWidget() {
    var widget = document.getElementById('chat-widget');
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
        widgetSocket.disconnect();
    }
    widgetSocket = io({
        transports: ['websocket', 'polling']
    });
    setupWidgetSocketListeners();
}

function joinWidgetAsUser() {
    var name = document.getElementById('widget-user-name').value.trim();
    if (!name) {
        alert('Пожалуйста, введите ваше имя');
        return;
    }
    widgetRole = 'user';
    widgetUser = { name: name, role: 'user' };
    connectWidgetToServer();
    if (widgetSocket.connected) {
        widgetSocket.emit('register', { name: name, role: 'user' });
    } else {
        widgetSocket.on('connect', function() {
            widgetSocket.emit('register', { name: name, role: 'user' });
        });
    }
}

function joinWidgetAsOperator() {
    var name = document.getElementById('widget-operator-name').value.trim();
    var code = document.getElementById('widget-operator-code').value;
    if (!name) {
        alert('Пожалуйста, введите ваше имя');
        return;
    }
    if (code !== '1234') {
        alert('Неверный код оператора');
        return;
    }
    widgetRole = 'operator';
    widgetUser = { name: name, role: 'operator' };
    connectWidgetToServer();
    if (widgetSocket.connected) {
        widgetSocket.emit('register', { name: name, role: 'operator' });
    } else {
        widgetSocket.on('connect', function() {
            widgetSocket.emit('register', { name: name, role: 'operator' });
        });
    }
}

function setupWidgetSocketListeners() {
    widgetSocket.on('registered', function(data) {
        if (widgetRole === 'user') {
            widgetTicket = data.ticketId;
            document.getElementById('widget-user-form').classList.add('hidden');
            showWidgetChatInterface();
            document.getElementById('widget-chat-title').innerText = 'Чат поддержки';
            updateWidgetStatus('waiting', 'Ожидание оператора');
            widgetSocket.emit('get_history', { ticketId: widgetTicket });
        } else if (widgetRole === 'operator') {
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
        widgetTicket = null;
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
    var container = document.getElementById('widget-tickets-list');
    if (!tickets || tickets.length === 0) {
        container.innerHTML = '<div class="empty-tickets">Нет активных запросов</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < tickets.length; i++) {
        html += '<div class="ticket-item" onclick="selectWidgetTicket(\'' + tickets[i].id + '\', event)">' +
            '<div class="ticket-name">' + escapeHtmlWidget(tickets[i].userName) + '</div>' +
            '<div class="ticket-time">' + formatDateWidget(tickets[i].createdAt) + '</div>' +
            '</div>';
    }
    container.innerHTML = html;
}

function selectWidgetTicket(ticketId, event) {
    widgetTicket = ticketId;
    widgetSocket.emit('take_ticket', { ticketId: ticketId });
    var items = document.querySelectorAll('#widget-tickets-list .ticket-item');
    for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('active');
    }
    if (event && event.target) {
        var item = event.target.closest('.ticket-item');
        if (item) item.classList.add('active');
    }
    updateWidgetStatus('connecting', 'Подключение...');
    document.getElementById('widget-close-ticket-btn').classList.remove('hidden');
    widgetSocket.emit('get_history', { ticketId: ticketId });
}

function updateWidgetStatus(status, text) {
    var statusEl = document.getElementById('widget-chat-status');
    if (!statusEl) return;
    statusEl.className = 'status-badge ' + status;
    statusEl.innerText = text;
}

function enableWidgetMessaging(enabled) {
    var input = document.getElementById('widget-message-input');
    var sendBtn = document.getElementById('widget-send-btn');
    if (input) {
        input.disabled = !enabled;
        input.placeholder = enabled ? 'Введите сообщение...' : 'Чат недоступен';
    }
    if (sendBtn) sendBtn.disabled = !enabled;
}

function sendWidgetMessage() {
    var input = document.getElementById('widget-message-input');
    var message = input.value.trim();
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
    var messagesArea = document.getElementById('widget-messages-area');
    if (!messagesArea) return;
    
    var isMyMessage = false;
    if (widgetRole === 'operator' && message.senderRole === 'operator') {
        isMyMessage = true;
    } else if (widgetRole === 'user' && message.senderRole === 'user') {
        isMyMessage = true;
    }
    
    var messageClass = isMyMessage ? 'my-message' : (message.senderRole === 'system' ? 'system-message' : 'other-message');
    
    var messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + messageClass;
    
    var senderHtml = '';
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
    var messagesArea = document.getElementById('widget-messages-area');
    if (!messagesArea) return;
    messagesArea.innerHTML = '';
    
    if (!messages || messages.length === 0) {
        messagesArea.innerHTML = '<div class="welcome-message"><p>💬 Начните общение!</p></div>';
        return;
    }
    
    for (var i = 0; i < messages.length; i++) {
        var message = messages[i];
        
        var isMyMessage = false;
        if (widgetRole === 'operator' && message.senderRole === 'operator') {
            isMyMessage = true;
        } else if (widgetRole === 'user' && message.senderRole === 'user') {
            isMyMessage = true;
        }
        
        var messageClass = isMyMessage ? 'my-message' : (message.senderRole === 'system' ? 'system-message' : 'other-message');
        
        var messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + messageClass;
        
        var senderHtml = '';
        if (!isMyMessage && message.senderRole !== 'system') {
            senderHtml = '<div class="message-sender">' + escapeHtmlWidget(message.sender) + '</div>';
        }
        
        messageDiv.innerHTML = senderHtml +
            '<div class="message-bubble">' + escapeHtmlWidget(message.text) + '</div>' +
            '<div class="message-info">' + formatTimeWidget(message.timestamp) + '</div>';
        
        messagesArea.appendChild(messageDiv);
    }
    scrollWidgetToBottom();
}

function updateWidgetMessageArea(text) {
    var messagesArea = document.getElementById('widget-messages-area');
    if (messagesArea) {
        messagesArea.innerHTML = '<div class="welcome-message"><p>' + escapeHtmlWidget(text) + '</p></div>';
    }
}

function showWidgetTypingIndicator(userName, isTyping) {
    var indicator = document.getElementById('widget-typing-indicator');
    var typingText = document.getElementById('widget-typing-text');
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
    var input = document.getElementById('widget-message-input');
    if (input && input.value.trim().length > 0) {
        widgetSocket.emit('typing', { ticketId: widgetTicket, isTyping: true, userName: widgetUser.name });
        clearWidgetTypingTimeout();
        widgetTypingTimeout = setTimeout(function() {
            widgetSocket.emit('typing', { ticketId: widgetTicket, isTyping: false, userName: widgetUser.name });
        }, 2000);
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
        if (widgetSocket) widgetSocket.disconnect();
        resetWidgetToLogin();
    }
}

function resetWidgetToLogin() {
    widgetUser = null;
    widgetTicket = null;
    widgetRole = null;
    
    document.getElementById('chat-widget').classList.remove('operator-mode');
    document.getElementById('widget-chat-interface').classList.add('hidden');
    document.getElementById('widget-operator-sidebar').classList.add('hidden');
    document.getElementById('widget-login-screen').classList.remove('hidden');
    
    var userNameInput = document.getElementById('widget-user-name');
    var operatorNameInput = document.getElementById('widget-operator-name');
    var operatorCodeInput = document.getElementById('widget-operator-code');
    
    if (userNameInput) userNameInput.value = '';
    if (operatorNameInput) operatorNameInput.value = '';
    if (operatorCodeInput) operatorCodeInput.value = '';
    
    var messagesArea = document.getElementById('widget-messages-area');
    if (messagesArea) {
        messagesArea.innerHTML = '<div class="welcome-message"><p>👋 Добро пожаловать в чат поддержки!</p><p class="small">Выберите роль для начала общения</p></div>';
    }
}

function scrollWidgetToBottom() {
    var messagesArea = document.getElementById('widget-messages-area');
    if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
}

function formatDateWidget(date) {
    if (!date) return '';
    var d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function formatTimeWidget(timestamp) {
    if (!timestamp) return '';
    var date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtmlWidget(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', function() {
    var messageInput = document.getElementById('widget-message-input');
    var sendBtn = document.getElementById('widget-send-btn');
    var logoutBtn = document.getElementById('widget-logout-btn');
    
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
    
    var chatBtn = document.getElementById('chat-toggle-btn');
    if (chatBtn) {
        chatBtn.classList.remove('hidden');
    }
});