const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const employeesRouter = require('./routes/employees');
app.use('/api/employees', employeesRouter);

app.get('/', (req, res) => {
    res.render('index', { title: 'Отдел кадров' });
});

app.get('/add', (req, res) => {
    res.render('index', { title: 'Отдел кадров' });
});

app.get('/chat', (req, res) => {
    res.render('chat', { title: 'Чат-поддержка' });
});

const chatStore = require('./routes/chat-store');
let store = chatStore.readStore();
let tickets = new Map();
let activeUsers = new Map();

if (store.tickets) {
    Object.keys(store.tickets).forEach(key => {
        tickets.set(key, store.tickets[key]);
    });
}

function saveStore() {
    const ticketsObj = {};
    tickets.forEach((value, key) => {
        ticketsObj[key] = value;
    });
    chatStore.writeStore({ tickets: ticketsObj });
}

function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function findSocketByUserId(userId) {
    for (const [socketId, user] of activeUsers.entries()) {
        if (user.id === userId) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) return socket;
        }
    }
    return null;
}

function updateOperatorsTicketList() {
    const waitingTickets = [];
    tickets.forEach(t => {
        if (t.status === 'waiting') {
            waitingTickets.push({
                id: t.id,
                userName: t.userName,
                createdAt: t.createdAt
            });
        }
    });

    activeUsers.forEach(user => {
        if (user.role === 'operator') {
            const socket = io.sockets.sockets.get(user.socketId);
            if (socket) {
                socket.emit('tickets_list', waitingTickets);
            }
        }
    });
}

io.on('connection', (socket) => {
    console.log('Клиент чата подключен:', socket.id);

    socket.on('request_tickets', () => {
        const waitingTickets = [];
        tickets.forEach(t => {
            if (t.status === 'waiting') {
                waitingTickets.push({
                    id: t.id,
                    userName: t.userName,
                    createdAt: t.createdAt
                });
            }
        });
        socket.emit('tickets_list', waitingTickets);
    });

    socket.on('register', (data) => {
        const { name, role } = data;
        const userId = generateUserId();
        const userData = {
            id: userId,
            name: name,
            role: role,
            socketId: socket.id,
            currentTicket: null
        };

        activeUsers.set(socket.id, userData);

        if (role === 'user') {
            const newTicket = {
                id: uuidv4(),
                userId: userId,
                userName: name,
                status: 'waiting',
                messages: [],
                createdAt: new Date().toISOString(),
                operatorId: null
            };
            tickets.set(newTicket.id, newTicket);
            userData.currentTicket = newTicket.id;

            socket.emit('registered', {
                userId: userId,
                ticketId: newTicket.id,
                role: 'user'
            });

            socket.join('ticket_' + newTicket.id);

            const systemMessage = {
                id: uuidv4(),
                text: 'Запрос #' + newTicket.id.slice(0, 8) + ' создан. Ожидайте ответа оператора.',
                sender: 'Система',
                senderId: 'system',
                senderRole: 'system',
                timestamp: new Date().toISOString()
            };
            newTicket.messages.push(systemMessage);
            socket.emit('new_message', systemMessage);

            saveStore();
            updateOperatorsTicketList();
        }
        else if (role === 'operator') {
            socket.emit('registered', {
                userId: userId,
                role: 'operator'
            });

            const waitingTickets = [];
            tickets.forEach(t => {
                if (t.status === 'waiting') {
                    waitingTickets.push({
                        id: t.id,
                        userName: t.userName,
                        createdAt: t.createdAt
                    });
                }
            });

            socket.emit('tickets_list', waitingTickets);
        }
    });

    socket.on('take_ticket', (data) => {
        const { ticketId } = data;
        const operator = activeUsers.get(socket.id);

        if (!operator || operator.role !== 'operator') return;

        const ticket = tickets.get(ticketId);
        if (!ticket || ticket.status !== 'waiting') return;

        ticket.status = 'active';
        ticket.operatorId = operator.id;
        operator.currentTicket = ticketId;

        socket.join('ticket_' + ticketId);

        const userSocket = findSocketByUserId(ticket.userId);
        if (userSocket) {
            userSocket.join('ticket_' + ticketId);
            userSocket.emit('operator_joined', {
                message: 'Оператор подключился к диалогу',
                operatorName: operator.name
            });
        }

        const systemMessage = {
            id: uuidv4(),
            text: 'Оператор ' + operator.name + ' присоединился к чату',
            sender: 'Система',
            senderId: 'system',
            senderRole: 'system',
            timestamp: new Date().toISOString()
        };
        ticket.messages.push(systemMessage);
        io.to('ticket_' + ticketId).emit('new_message', systemMessage);

        io.to('ticket_' + ticketId).emit('ticket_status', {
            status: 'active',
            operatorName: operator.name
        });

        saveStore();
        updateOperatorsTicketList();
    });

    socket.on('send_message', (data) => {
        const { ticketId, message } = data;
        const user = activeUsers.get(socket.id);

        if (!user) return;

        const ticket = tickets.get(ticketId);
        if (!ticket || ticket.status === 'closed') return;

        if (user.role === 'user' && ticket.status !== 'active') return;
        if (user.role === 'operator' && ticket.operatorId !== user.id) return;

        const messageData = {
            id: uuidv4(),
            text: message,
            sender: user.name,
            senderId: user.id,
            senderRole: user.role,
            timestamp: new Date().toISOString()
        };

        ticket.messages.push(messageData);
        io.to('ticket_' + ticketId).emit('new_message', messageData);
        saveStore();
    });

    socket.on('typing', (data) => {
        const { ticketId, isTyping, userName } = data;
        socket.to('ticket_' + ticketId).emit('user_typing', {
            userName: userName,
            isTyping: isTyping
        });
    });

    socket.on('close_ticket', (data) => {
        const { ticketId } = data;
        const user = activeUsers.get(socket.id);

        if (!user) return;

        const ticket = tickets.get(ticketId);
        if (ticket) {
            ticket.status = 'closed';

            const systemMessage = {
                id: uuidv4(),
                text: 'Запрос закрыт. Спасибо за обращение!',
                sender: 'Система',
                senderId: 'system',
                senderRole: 'system',
                timestamp: new Date().toISOString()
            };
            ticket.messages.push(systemMessage);
            io.to('ticket_' + ticketId).emit('new_message', systemMessage);
            io.to('ticket_' + ticketId).emit('ticket_closed', {
                message: 'Запрос закрыт. Спасибо за обращение!'
            });

            const userSocket = findSocketByUserId(ticket.userId);
            if (userSocket) {
                userSocket.leave('ticket_' + ticketId);
                const userData = activeUsers.get(userSocket.id);
                if (userData) userData.currentTicket = null;
            }

            const operatorSocket = findSocketByUserId(ticket.operatorId);
            if (operatorSocket) {
                operatorSocket.leave('ticket_' + ticketId);
                const operatorData = activeUsers.get(operatorSocket.id);
                if (operatorData) operatorData.currentTicket = null;
            }

            setTimeout(() => {
                tickets.delete(ticketId);
                saveStore();
            }, 60000);
        }

        if (user.role === 'operator') {
            user.currentTicket = null;
            updateOperatorsTicketList();
        } else if (user.role === 'user') {
            socket.emit('support_ended');
        }
    });

    socket.on('get_history', (data) => {
        const { ticketId } = data;
        const ticket = tickets.get(ticketId);

        if (ticket) {
            socket.emit('message_history', {
                messages: ticket.messages,
                status: ticket.status
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Клиент отключен:', socket.id);
        const user = activeUsers.get(socket.id);

        if (user) {
            activeUsers.delete(socket.id);
            
            setTimeout(() => {
                const stillConnected = findSocketByUserId(user.id);
                if (!stillConnected) {
                    if (user.currentTicket) {
                        const ticket = tickets.get(user.currentTicket);
                        if (ticket) {
                            if (user.role === 'operator' && ticket.status === 'active') {
                                ticket.status = 'waiting';
                                ticket.operatorId = null;
                                updateOperatorsTicketList();
                                saveStore();
                            }
                        }
                    }
                }
            }, 5000);
        }
    });
});

server.listen(PORT, () => {
    console.log('========================================');
    console.log('ЛР9 - Чат-поддержка: http://localhost:' + PORT + '/chat');
    console.log('Код оператора: 1234');
    console.log('========================================');
});