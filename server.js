const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling']
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

app.get('/chat', (req, res) => {
    res.render('chat', { title: 'Чат-поддержка' });
});

const chatStore = require('./store');

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);
    let currentTicketId = null;
    let currentRole = null;
    let currentName = null;

    socket.on('register', (data) => {
        currentRole = data.role;
        currentName = data.name;

        if (data.role === 'user') {
            const ticket = chatStore.createTicket(data.name);
            currentTicketId = ticket.id;
            socket.join('ticket_' + ticket.id);
            
            socket.emit('registered', {
                ticketId: ticket.id,
                role: 'user'
            });

            const systemMsg = {
                id: uuidv4(),
                text: 'Запрос создан. Ожидайте оператора.',
                sender: 'Система',
                senderId: 'system',
                senderRole: 'system',
                timestamp: new Date().toISOString()
            };
            socket.emit('new_message', systemMsg);

            const waiting = chatStore.getWaitingTickets();
            io.emit('tickets_list', waiting);
        } else if (data.role === 'operator') {
            socket.emit('registered', { role: 'operator' });
            const waiting = chatStore.getWaitingTickets();
            socket.emit('tickets_list', waiting);
        }
    });

    socket.on('request_tickets', () => {
        const waiting = chatStore.getWaitingTickets();
        socket.emit('tickets_list', waiting);
    });

    socket.on('take_ticket', (data) => {
        const ticket = chatStore.updateTicketStatus(data.ticketId, 'active', socket.id);
        if (ticket) {
            currentTicketId = data.ticketId;
            socket.join('ticket_' + data.ticketId);
            
            const systemMsg = {
                id: uuidv4(),
                text: 'Оператор ' + currentName + ' присоединился',
                sender: 'Система',
                senderId: 'system',
                senderRole: 'system',
                timestamp: new Date().toISOString()
            };
            io.to('ticket_' + data.ticketId).emit('new_message', systemMsg);
            io.to('ticket_' + data.ticketId).emit('ticket_status', {
                status: 'active',
                operatorName: currentName
            });

            const waiting = chatStore.getWaitingTickets();
            io.emit('tickets_list', waiting);
        }
    });

    socket.on('send_message', (data) => {
        if (!currentTicketId) return;
        
        const ticket = chatStore.getTicket(data.ticketId);
        if (!ticket || ticket.status === 'closed') return;

        const msg = {
            id: uuidv4(),
            text: data.message,
            sender: currentName,
            senderId: currentRole,
            senderRole: currentRole,
            timestamp: new Date().toISOString()
        };
        io.to('ticket_' + data.ticketId).emit('new_message', msg);
    });

    socket.on('close_ticket', (data) => {
        const ticket = chatStore.closeTicket(data.ticketId);
        if (ticket) {
            const systemMsg = {
                id: uuidv4(),
                text: 'Запрос закрыт.',
                sender: 'Система',
                senderId: 'system',
                senderRole: 'system',
                timestamp: new Date().toISOString()
            };
            io.to('ticket_' + data.ticketId).emit('new_message', systemMsg);
            io.to('ticket_' + data.ticketId).emit('ticket_closed', {});
        }
        currentTicketId = null;
    });

    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);
        if (currentTicketId && currentRole === 'operator') {
            const ticket = chatStore.updateTicketStatus(currentTicketId, 'waiting', null);
            if (ticket) {
                const systemMsg = {
                    id: uuidv4(),
                    text: 'Оператор отключился. Ожидайте нового оператора.',
                    sender: 'Система',
                    senderId: 'system',
                    senderRole: 'system',
                    timestamp: new Date().toISOString()
                };
                socket.to('ticket_' + currentTicketId).emit('new_message', systemMsg);
                socket.to('ticket_' + currentTicketId).emit('ticket_status', {
                    status: 'waiting'
                });
            }
        }
        const waiting = chatStore.getWaitingTickets();
        io.emit('tickets_list', waiting);
    });
});

server.listen(PORT, () => {
    console.log('Server: http://localhost:' + PORT);
    console.log('Chat: http://localhost:' + PORT + '/chat');
    console.log('Operator code: 1234');
});