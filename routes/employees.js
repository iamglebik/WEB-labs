const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const dbPath = path.join(__dirname, '..', 'db.json');

function readEmployees() {
    try {
        const data = fs.readFileSync(dbPath, 'utf8');
        const json = JSON.parse(data);
        return json.employees || [];
    } catch (error) {
        console.error('Ошибка чтения db.json:', error);
        return [];
    }
}

function writeEmployees(employees) {
    try {
        const data = JSON.stringify({ employees: employees }, null, 2);
        fs.writeFileSync(dbPath, data, 'utf8');
    } catch (error) {
        console.error('Ошибка записи в db.json:', error);
        throw new Error('Не удалось сохранить данные');
    }
}

router.get('/', (req, res) => {
    const employees = readEmployees();
    res.json(employees);
});

router.get('/:id', (req, res) => {
    const employees = readEmployees();
    const employee = employees.find(e => e.id === req.params.id);
    if (employee) {
        res.json(employee);
    } else {
        res.status(404).json({ error: 'Сотрудник не найден' });
    }
});

router.post('/', (req, res) => {
    try {
        const employees = readEmployees();
        const newEmployee = req.body;

        const existing = employees.find(e => e.id === newEmployee.id);
        if (existing) {
            res.status(400).json({ error: 'Сотрудник с таким табельным номером уже существует' });
            return;
        }

        employees.push(newEmployee);
        writeEmployees(employees);
        res.status(201).json(newEmployee);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при добавлении сотрудника' });
    }
});

router.put('/:id', (req, res) => {
    try {
        const employees = readEmployees();
        const index = employees.findIndex(e => e.id === req.params.id);

        if (index !== -1) {
            employees[index] = { ...req.body, id: req.params.id };
            writeEmployees(employees);
            res.json(employees[index]);
        } else {
            res.status(404).json({ error: 'Сотрудник не найден' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при обновлении сотрудника' });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const employees = readEmployees();
        const index = employees.findIndex(e => e.id === req.params.id);

        if (index !== -1) {
            const deleted = employees.splice(index, 1);
            writeEmployees(employees);
            res.json({ message: 'Сотрудник удален', employee: deleted[0] });
        } else {
            res.status(404).json({ error: 'Сотрудник не найден' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при удалении сотрудника' });
    }
});

module.exports = router;