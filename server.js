const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

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

let tickets = new Map();
let activeUsers = new Map();

const STORE_FILE = path.join(__dirname, 'tickets-store.json');

function saveTickets() {
    const obj = {};
    tickets.forEach((v, k) => { obj[k] = v; });
    try { fs.writeFileSync(STORE_FILE, JSON.stringify(obj)); } catch(e) {}
}

function loadTickets() {
    try {
        if (fs.existsSync(STORE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
            Object.keys(data).forEach(k => tickets.set(k, data[k]));
        }
    } catch(e) {}
}

loadTickets();

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

function sendTicketsToOperators() {
    const waiting = [];
    tickets.forEach(t => {
        if (t.status === 'waiting') waiting.push({ id: t.id, userName: t.userName, createdAt: t.createdAt });
    });
    activeUsers.forEach(user => {
        if (user.role === 'operator') {
            const s = io.sockets.sockets.get(user.socketId);
            if (s) s.emit('tickets_list', waiting);
        }
    });
}

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    socket.on('request_tickets', () => {
        const waiting = [];
        tickets.forEach(t => {
            if (t.status === 'waiting') waiting.push({ id: t.id, userName: t.userName, createdAt: t.createdAt });
        });
        socket.emit('tickets_list', waiting);
    });

    socket.on('register', (data) => {
        const { name, role } = data;
        const userId = generateUserId();
        activeUsers.set(socket.id, { id: userId, name, role, socketId: socket.id, currentTicket: null });

        if (role === 'user') {
            const ticket = {
                id: uuidv4(),
                userId,
                userName: name,
                status: 'waiting',
                messages: [],
                createdAt: new Date().toISOString(),
                operatorId: null
            };
            tickets.set(ticket.id, ticket);
            activeUsers.get(socket.id).currentTicket = ticket.id;

            socket.emit('registered', { userId, ticketId: ticket.id, role: 'user' });
            socket.join('ticket_' + ticket.id);

            const msg = { id: uuidv4(), text: 'Запрос создан. Ожидайте оператора.', sender: 'Система', senderId: 'system', senderRole: 'system', timestamp: new Date().toISOString() };
            ticket.messages.push(msg);
            socket.emit('new_message', msg);
            saveTickets();
            sendTicketsToOperators();
        } else {
            socket.emit('registered', { userId, role: 'operator' });
            const waiting = [];
            tickets.forEach(t => {
                if (t.status === 'waiting') waiting.push({ id: t.id, userName: t.userName, createdAt: t.createdAt });
            });
            socket.emit('tickets_list', waiting);
        }
    });

    socket.on('take_ticket', (data) => {
        const op = activeUsers.get(socket.id);
        if (!op || op.role !== 'operator') return;
        const ticket = tickets.get(data.ticketId);
        if (!ticket || ticket.status !== 'waiting') return;

        ticket.status = 'active';
        ticket.operatorId = op.id;
        op.currentTicket = data.ticketId;
        socket.join('ticket_' + data.ticketId);

        const us = findSocketByUserId(ticket.userId);
        if (us) {
            us.join('ticket_' + data.ticketId);
            us.emit('operator_joined', { operatorName: op.name });
        }

        const msg = { id: uuidv4(), text: 'Оператор ' + op.name + ' присоединился', sender: 'Система', senderId: 'system', senderRole: 'system', timestamp: new Date().toISOString() };
        ticket.messages.push(msg);
        io.to('ticket_' + data.ticketId).emit('new_message', msg);
        io.to('ticket_' + data.ticketId).emit('ticket_status', { status: 'active', operatorName: op.name });
        saveTickets();
        sendTicketsToOperators();
    });

    socket.on('send_message', (data) => {
        const user = activeUsers.get(socket.id);
        if (!user) return;
        const ticket = tickets.get(data.ticketId);
        if (!ticket || ticket.status === 'closed') return;
        if (user.role === 'user' && ticket.status !== 'active') return;
        if (user.role === 'operator' && ticket.operatorId !== user.id) return;

        const msg = { id: uuidv4(), text: data.message, sender: user.name, senderId: user.id, senderRole: user.role, timestamp: new Date().toISOString() };
        ticket.messages.push(msg);
        io.to('ticket_' + data.ticketId).emit('new_message', msg);
        saveTickets();
    });

    socket.on('typing', (data) => {
        socket.to('ticket_' + data.ticketId).emit('user_typing', { userName: data.userName, isTyping: data.isTyping });
    });

    socket.on('close_ticket', (data) => {
        const user = activeUsers.get(socket.id);
        if (!user) return;
        const ticket = tickets.get(data.ticketId);
        if (!ticket) return;
        ticket.status = 'closed';
        const msg = { id: uuidv4(), text: 'Запрос закрыт.', sender: 'Система', senderId: 'system', senderRole: 'system', timestamp: new Date().toISOString() };
        ticket.messages.push(msg);
        io.to('ticket_' + data.ticketId).emit('new_message', msg);
        io.to('ticket_' + data.ticketId).emit('ticket_closed', {});

        const us = findSocketByUserId(ticket.userId);
        if (us) { us.leave('ticket_' + data.ticketId); if (activeUsers.has(us.id)) activeUsers.get(us.id).currentTicket = null; }
        const os = findSocketByUserId(ticket.operatorId);
        if (os) { os.leave('ticket_' + data.ticketId); if (activeUsers.has(os.id)) activeUsers.get(os.id).currentTicket = null; }

        if (user.role === 'user') socket.emit('support_ended');
        if (user.role === 'operator') { user.currentTicket = null; sendTicketsToOperators(); }
        saveTickets();
    });

    socket.on('get_history', (data) => {
        const ticket = tickets.get(data.ticketId);
        if (ticket) socket.emit('message_history', { messages: ticket.messages, status: ticket.status });
    });

    socket.on('disconnect', () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            if (user.role === 'operator' && user.currentTicket) {
                const ticket = tickets.get(user.currentTicket);
                if (ticket && ticket.status === 'active') {
                    ticket.status = 'waiting';
                    ticket.operatorId = null;
                    const msg = { id: uuidv4(), text: 'Оператор отключился. Ожидайте нового оператора.', sender: 'Система', senderId: 'system', senderRole: 'system', timestamp: new Date().toISOString() };
                    ticket.messages.push(msg);
                    socket.to('ticket_' + user.currentTicket).emit('new_message', msg);
                    socket.to('ticket_' + user.currentTicket).emit('ticket_status', { status: 'waiting' });
                    saveTickets();
                }
            }
            activeUsers.delete(socket.id);
            sendTicketsToOperators();
        }
    });
});

server.listen(PORT, () => {
    console.log('Server: http://localhost:' + PORT);
    console.log('Chat: http://localhost:' + PORT + '/chat');
    console.log('Operator code: 1234');
});