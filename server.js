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
    cors: { origin: "*", methods: ["GET", "POST"] },
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

app.get('/', (req, res) => { res.render('index', { title: 'Отдел кадров' }); });
app.get('/add', (req, res) => { res.render('index', { title: 'Отдел кадров' }); });
app.get('/chat', (req, res) => { res.render('chat', { title: 'Чат-поддержка' }); });

const STORE_FILE = path.join(__dirname, 'tickets-store.json');

function readStore() {
    try {
        if (fs.existsSync(STORE_FILE)) {
            return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        }
    } catch(e) {}
    return { tickets: {} };
}

function writeStore(data) {
    try { fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch(e) {}
}

function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    socket.on('request_tickets', () => {
        const store = readStore();
        const waiting = [];
        Object.keys(store.tickets).forEach(id => {
            if (store.tickets[id].status === 'waiting') {
                waiting.push({ id, userName: store.tickets[id].userName, createdAt: store.tickets[id].createdAt });
            }
        });
        socket.emit('tickets_list', waiting);
    });

    socket.on('register', (data) => {
        const store = readStore();
        const userId = generateUserId();

        if (data.role === 'user') {
            const ticketId = uuidv4();
            store.tickets[ticketId] = {
                id: ticketId,
                userId,
                userName: data.name,
                status: 'waiting',
                messages: [],
                createdAt: new Date().toISOString(),
                operatorId: null
            };
            socket.join('ticket_' + ticketId);
            socket.emit('registered', { userId, ticketId, role: 'user' });
        } else {
            socket.emit('registered', { userId, role: 'operator' });
            const waiting = [];
            Object.keys(store.tickets).forEach(id => {
                if (store.tickets[id].status === 'waiting') {
                    waiting.push({ id, userName: store.tickets[id].userName, createdAt: store.tickets[id].createdAt });
                }
            });
            socket.emit('tickets_list', waiting);
        }
        writeStore(store);
    });

    socket.on('reconnect_user', (data) => {
        const store = readStore();
        const ticket = store.tickets[data.ticketId];
        if (ticket && ticket.status !== 'closed') {
            const userId = generateUserId();
            ticket.userId = userId;
            socket.join('ticket_' + data.ticketId);
            socket.emit('reconnected_to_ticket', {
                ticketId: data.ticketId,
                userId,
                status: ticket.status,
                operatorName: ticket.operatorName || ''
            });
        } else {
            const ticketId = uuidv4();
            store.tickets[ticketId] = {
                id: ticketId,
                userId: generateUserId(),
                userName: data.name,
                status: 'waiting',
                messages: [],
                createdAt: new Date().toISOString(),
                operatorId: null
            };
            socket.join('ticket_' + ticketId);
            socket.emit('registered', { userId: store.tickets[ticketId].userId, ticketId, role: 'user' });
        }
        writeStore(store);
    });

    socket.on('take_ticket', (data) => {
        const store = readStore();
        const ticket = store.tickets[data.ticketId];
        if (ticket && ticket.status === 'waiting') {
            ticket.status = 'active';
            ticket.operatorId = socket.id;
            socket.join('ticket_' + data.ticketId);
            io.to('ticket_' + data.ticketId).emit('ticket_status', { status: 'active' });
            writeStore(store);
            socket.emit('request_tickets');
        }
    });

    socket.on('send_message', (data) => {
        const store = readStore();
        const ticket = store.tickets[data.ticketId];
        if (ticket && ticket.status !== 'closed') {
            ticket.messages.push({
                id: uuidv4(),
                text: data.message,
                sender: data.senderName,
                senderId: socket.id,
                senderRole: 'user',
                timestamp: new Date().toISOString()
            });
            io.to('ticket_' + data.ticketId).emit('new_message', ticket.messages[ticket.messages.length - 1]);
            writeStore(store);
        }
    });

    socket.on('close_ticket', (data) => {
        const store = readStore();
        const ticket = store.tickets[data.ticketId];
        if (ticket) {
            ticket.status = 'closed';
            io.to('ticket_' + data.ticketId).emit('ticket_closed', {});
            writeStore(store);
        }
    });

    socket.on('get_history', (data) => {
        const store = readStore();
        const ticket = store.tickets[data.ticketId];
        if (ticket) {
            socket.emit('message_history', { messages: ticket.messages, status: ticket.status });
        }
    });
});

server.listen(PORT, () => {
    console.log('Server: http://localhost:' + PORT);
});