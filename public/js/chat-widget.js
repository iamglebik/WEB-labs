// chat-widget.js - Виджет чата поддержки
let socket;
let currentUser = null;
let currentTicket = null;
let currentRole = null;
let typingTimeout = null;

// Показать/скрыть виджет
function toggleChatWidget() {
    const widget = document.getElementById('chat-widget');
    if (!widget) return;
    widget.classList.toggle('open');
}

function closeChatWidget() {
    const widget = document.getElementById('chat-widget');
    if (widget) widget.classList.remove('open');
}

// Показать форму выбора роли
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

// Подключение к серверу
function connectWidgetToServer() {
    if (socket) {
        socket.disconnect();
    }
    socket = io();
    setupWidgetSocketListeners();
}

// Вход как пользователь
function joinWidgetAsUser() {
    const name = document.getElementById('widget-user-name').value.trim();
    if (!name) {
        alert('Пожалуйста, введите ваше имя');
        return;
    }

    currentRole = 'user';
    connectWidgetToServer();

    if (socket.connected) {
        socket.emit('register', { name, role: 'user' });
    } else {
        socket.on('connect', () => {
            socket.emit('register', { name, role: 'user' });
        });
    }
}

// Вход как оператор
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

    currentRole = 'operator';
    connectWidgetToServer();

    if (socket.connected) {
        socket.emit('register', { name, role: 'operator' });
    } else {
        socket.on('connect', () => {
            socket.emit('register', { name, role: 'operator' });
        });
    }
}

// Настройка слушателей сокета
function setupWidgetSocketListeners() {
    socket.on('registered', (data) => {
        if (currentRole === 'user') {
            currentUser = {
                id: data.userId,
                name: document.getElementById('widget-user-name').value.trim(),
                role: 'user'
            };
            currentTicket = data.ticketId;

            document.getElementById('widget-user-form').classList.add('hidden');
            showWidgetChatInterface();

            document.getElementById('widget-chat-title').innerText = 'Чат поддержки';
            updateWidgetStatus('waiting', 'Ожидание оператора');
            socket.emit('get_history', { ticketId: currentTicket });
        } else if (currentRole === 'operator') {
            currentUser = {
                id: data.userId,
                name: document.getElementById('widget-operator-name').value.trim(),
                role: 'operator'
            };

            document.getElementById('widget-operator-form').classList.add('hidden');
            showWidgetChatInterface();

            document.getElementById('widget-chat-title').innerText = 'Панель оператора';
            document.getElementById('widget-operator-name-display').innerText = currentUser.name;
            document.getElementById('widget-operator-sidebar').classList.remove('hidden');
            document.getElementById('widget-close-ticket-btn').classList.add('hidden');

            updateWidgetStatus('waiting', 'Выберите запрос');
            updateWidgetMessageArea('Выберите запрос из списка');
        }
    });

    socket.on('ticket_created', (data) => {
        if (currentRole === 'operator') {
            addWidgetNotification(`Новый запрос от ${data.userName}`);
        }
    });

    socket.on('tickets_list', (tickets) => {
        updateWidgetTicketsList(tickets);
    });

    socket.on('ticket_status', (data) => {
        if (data.status === 'active') {
            updateWidgetStatus('active', `Оператор: ${data.operatorName}`);
            enableWidgetMessaging(true);
        }
    });

    socket.on('new_message', (message) => {
        addWidgetMessageToChat(message);
        scrollWidgetToBottom();
    });

    socket.on('message_history', (data) => {
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

    socket.on('user_typing', (data) => {
        showWidgetTypingIndicator(data.userName, data.isTyping);
    });

    socket.on('ticket_closed', () => {
        updateWidgetStatus('closed', 'Запрос закрыт');
        enableWidgetMessaging(false);
        if (currentRole === 'operator') {
            document.getElementById('widget-close-ticket-btn').classList.add('hidden');
        }
    });

    socket.on('operator_joined', (data) => {
        updateWidgetStatus('active', `Оператор: ${data.operatorName}`);
        enableWidgetMessaging(true);
    });

    socket.on('user_disconnected', () => {
        updateWidgetStatus('waiting', 'Ожидание подключения');
        enableWidgetMessaging(false);
    });

    socket.on('support_ended', () => {
        setTimeout(() => resetWidgetToLogin(), 2000);
    });
}

// Показать интерфейс чата
function showWidgetChatInterface() {
    document.getElementById('widget-login-screen').classList.add('hidden');
    document.getElementById('widget-user-form').classList.add('hidden');
    document.getElementById('widget-operator-form').classList.add('hidden');
    document.getElementById('widget-chat-interface').classList.remove('hidden');
}

// Обновление списка заявок
function updateWidgetTicketsList(tickets) {
    const container = document.getElementById('widget-tickets-list');
    if (!tickets || tickets.length === 0) {
        container.innerHTML = '<div class="empty-tickets">Нет активных запросов</div>';
        return;
    }

    container.innerHTML = tickets.map(ticket => `
        <div class="ticket-item" onclick="selectWidgetTicket('${ticket.id}', event)">
            <div class="ticket-name">${escapeHtmlWidget(ticket.userName)}</div>
            <div class="ticket-time">${formatDateWidget(ticket.createdAt)}</div>
        </div>
    `).join('');
}

// Выбор заявки оператором
function selectWidgetTicket(ticketId, event) {
    currentTicket = ticketId;
    socket.emit('take_ticket', { ticketId });

    document.querySelectorAll('#widget-tickets-list .ticket-item').forEach(el => {
        el.classList.remove('active');
    });
    if (event && event.target) {
        event.target.closest('.ticket-item').classList.add('active');
    }

    updateWidgetStatus('connecting', 'Подключение...');
    document.getElementById('widget-close-ticket-btn').classList.remove('hidden');
    socket.emit('get_history', { ticketId });
}

// Обновление статуса
function updateWidgetStatus(status, text) {
    const statusEl = document.getElementById('widget-chat-status');
    if (!statusEl) return;
    statusEl.className = `status-badge ${status}`;
    statusEl.innerText = text;
}

// Вкл/выкл отправку сообщений
function enableWidgetMessaging(enabled) {
    const input = document.getElementById('widget-message-input');
    const sendBtn = document.getElementById('widget-send-btn');
    if (input) input.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
    if (input) input.placeholder = enabled ? 'Введите сообщение...' : 'Чат недоступен';
}

// Отправка сообщения
function sendWidgetMessage() {
    const input = document.getElementById('widget-message-input');
    const message = input.value.trim();
    if (!message || !currentTicket) return;

    socket.emit('send_message', {
        ticketId: currentTicket,
        message,
        senderName: currentUser.name
    });

    input.value = '';
    clearWidgetTypingTimeout();
}

// Добавление сообщения в чат
function addWidgetMessageToChat(message) {
    const messagesArea = document.getElementById('widget-messages-area');
    if (!messagesArea) return;

    const isMyMessage = message.senderId === currentUser?.id;
    const messageClass = isMyMessage ? 'my-message' : (message.senderRole === 'system' ? 'system-message' : 'other-message');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${messageClass}`;

    let senderHtml = '';
    if (!isMyMessage && message.senderRole !== 'system') {
        senderHtml = `<div class="message-sender">${escapeHtmlWidget(message.sender)}</div>`;
    }

    messageDiv.innerHTML = `
        ${senderHtml}
        <div class="message-bubble">${escapeHtmlWidget(message.text)}</div>
        <div class="message-info">${formatTimeWidget(message.timestamp)}</div>
    `;

    messagesArea.appendChild(messageDiv);
    scrollWidgetToBottom();
}

// Отображение истории сообщений
function displayWidgetMessageHistory(messages) {
    const messagesArea = document.getElementById('widget-messages-area');
    if (!messagesArea) return;
    messagesArea.innerHTML = '';

    if (!messages || messages.length === 0) {
        messagesArea.innerHTML = '<div class="welcome-message"><p>💬 Начните общение!</p></div>';
        return;
    }

    messages.forEach(message => {
        const isMyMessage = message.senderId === currentUser?.id;
        const messageClass = isMyMessage ? 'my-message' : (message.senderRole === 'system' ? 'system-message' : 'other-message');

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${messageClass}`;

        let senderHtml = '';
        if (!isMyMessage && message.senderRole !== 'system') {
            senderHtml = `<div class="message-sender">${escapeHtmlWidget(message.sender)}</div>`;
        }

        messageDiv.innerHTML = `
            ${senderHtml}
            <div class="message-bubble">${escapeHtmlWidget(message.text)}</div>
            <div class="message-info">${formatTimeWidget(message.timestamp)}</div>
        `;

        messagesArea.appendChild(messageDiv);
    });

    scrollWidgetToBottom();
}

function updateWidgetMessageArea(text) {
    const messagesArea = document.getElementById('widget-messages-area');
    if (messagesArea) {
        messagesArea.innerHTML = `<div class="welcome-message"><p>${escapeHtmlWidget(text)}</p></div>`;
    }
}

// Индикатор печати
function showWidgetTypingIndicator(userName, isTyping) {
    const indicator = document.getElementById('widget-typing-indicator');
    const typingText = document.getElementById('widget-typing-text');
    if (!indicator || !typingText) return;

    if (isTyping) {
        typingText.innerText = `${escapeHtmlWidget(userName)} печатает...`;
        indicator.style.display = 'flex';
    } else {
        indicator.style.display = 'none';
    }
}

// Обработчик ввода текста
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('widget-message-input');
    const sendBtn = document.getElementById('widget-send-btn');
    const logoutBtn = document.getElementById('widget-logout-btn');

    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
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

    // Показать кнопку чата
    const chatBtn = document.getElementById('chat-toggle-btn');
    if (chatBtn) {
        chatBtn.classList.remove('hidden');
    }
});

function onWidgetTyping() {
    if (!currentTicket || !currentUser) return;
    socket.emit('typing', { ticketId: currentTicket, isTyping: true, userName: currentUser.name });
    clearWidgetTypingTimeout();
    typingTimeout = setTimeout(() => {
        socket.emit('typing', { ticketId: currentTicket, isTyping: false, userName: currentUser.name });
    }, 1000);
}

function clearWidgetTypingTimeout() {
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
}

// Закрытие заявки
function closeWidgetTicket() {
    if (!currentTicket) return;
    if (confirm('Завершить этот диалог?')) {
        socket.emit('close_ticket', { ticketId: currentTicket });
        enableWidgetMessaging(false);
        updateWidgetStatus('closed', 'Запрос закрыт');
        document.getElementById('widget-close-ticket-btn').classList.add('hidden');

        if (currentRole === 'user') {
            setTimeout(() => resetWidgetToLogin(), 2000);
        } else {
            currentTicket = null;
            updateWidgetStatus('waiting', 'Выберите запрос');
            updateWidgetMessageArea('Выберите запрос из списка');
        }
    }
}

// Выход
function logoutWidget() {
    if (confirm('Выйти из чата?')) {
        if (currentTicket && currentRole === 'operator') {
            socket.emit('close_ticket', { ticketId: currentTicket });
        }
        resetWidgetToLogin();
    }
}

// Сброс к экрану входа
function resetWidgetToLogin() {
    if (socket) socket.disconnect();
    currentUser = null;
    currentTicket = null;
    currentRole = null;

    document.getElementById('widget-chat-interface').classList.add('hidden');
    document.getElementById('widget-operator-sidebar').classList.add('hidden');
    document.getElementById('widget-login-screen').classList.remove('hidden');
    document.getElementById('widget-user-name').value = '';
    document.getElementById('widget-operator-name').value = '';
    document.getElementById('widget-operator-code').value = '';

    const messagesArea = document.getElementById('widget-messages-area');
    if (messagesArea) {
        messagesArea.innerHTML = '<div class="welcome-message"><p>👋 Добро пожаловать в чат поддержки!</p><p class="small">Выберите роль для начала общения</p></div>';
    }
}

// Уведомление
function addWidgetNotification(message) {
    const container = document.getElementById('widget-tickets-list');
    if (!container) return;
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerText = message;
    notification.style.cssText = `
        background: #667eea; color: white; padding: 8px; border-radius: 8px; margin-bottom: 10px;
    `;
    container.prepend(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Прокрутка вниз
function scrollWidgetToBottom() {
    const messagesArea = document.getElementById('widget-messages-area');
    if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
}

// Утилиты
function formatDateWidget(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
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