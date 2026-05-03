const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, 'chat-store.json');

function readStore() {
    try {
        if (fs.existsSync(STORE_FILE)) {
            const data = fs.readFileSync(STORE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading store:', e);
    }
    return { tickets: {} };
}

function writeStore(data) {
    try {
        fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error writing store:', e);
    }
}

function getTicket(ticketId) {
    const store = readStore();
    return store.tickets[ticketId] || null;
}

function getAllTickets() {
    const store = readStore();
    return Object.values(store.tickets);
}

function createTicket(userName) {
    const store = readStore();
    const { v4: uuidv4 } = require('uuid');
    const ticket = {
        id: uuidv4(),
        userName: userName,
        status: 'waiting',
        messages: [],
        createdAt: new Date().toISOString(),
        operatorId: null
    };
    store.tickets[ticket.id] = ticket;
    writeStore(store);
    return ticket;
}

function addMessage(ticketId, message) {
    const store = readStore();
    const ticket = store.tickets[ticketId];
    if (ticket) {
        ticket.messages.push(message);
        writeStore(store);
        return ticket;
    }
    return null;
}

function updateTicketStatus(ticketId, status, operatorId) {
    const store = readStore();
    const ticket = store.tickets[ticketId];
    if (ticket) {
        ticket.status = status;
        if (operatorId !== undefined) ticket.operatorId = operatorId;
        writeStore(store);
        return ticket;
    }
    return null;
}

function closeTicket(ticketId) {
    const store = readStore();
    const ticket = store.tickets[ticketId];
    if (ticket) {
        ticket.status = 'closed';
        writeStore(store);
        return ticket;
    }
    return null;
}

function getWaitingTickets() {
    const store = readStore();
    return Object.values(store.tickets).filter(t => t.status === 'waiting');
}

module.exports = {
    getTicket,
    getAllTickets,
    createTicket,
    addMessage,
    updateTicketStatus,
    closeTicket,
    getWaitingTickets
};