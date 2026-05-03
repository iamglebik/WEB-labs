const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '..', 'chat-store.json');

function readStore() {
    try {
        if (fs.existsSync(storePath)) {
            const data = fs.readFileSync(storePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Ошибка чтения chat-store.json:', error);
    }
    return { tickets: {}, users: {} };
}

function writeStore(data) {
    try {
        fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Ошибка записи chat-store.json:', error);
    }
}

module.exports = { readStore, writeStore };