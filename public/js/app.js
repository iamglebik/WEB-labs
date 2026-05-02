(function() {
    let currentPage = 'list';
    let employees = [];
    
    let currentPageNum = 1;
    let itemsPerPage = 5;
    let currentSort = 'fullName';
    let currentSortOrder = 'asc';
    let searchTerm = '';

    const API_URL = '/api/employees';
    
    function saveStateToHash() {
        if (currentPage === 'add') {
            window.location.hash = '#add';
            return;
        }
        
        if (currentPage === 'edit') {
            return;
        }
        
        const params = [];
        
        if (currentPageNum > 1) params.push(`page/${currentPageNum}`);
        if (currentSort !== 'fullName') params.push(`sort/${currentSort}`);
        if (currentSortOrder !== 'asc') params.push(`order/${currentSortOrder}`);
        if (searchTerm) params.push(`search/${encodeURIComponent(searchTerm)}`);
        
        let hash = '#list';
        if (params.length > 0) {
            hash += '/' + params.join('/');
        }
        
        if (window.location.hash !== hash) {
            history.pushState(null, null, hash);
        }
    }

    function loadStateFromHash() {
        const hash = window.location.hash;
        
        if (hash === '#add') {
            currentPage = 'add';
            return;
        }
        
        if (hash.startsWith('#edit/')) {
            currentPage = 'edit';
            return;
        }
        
        if (hash.startsWith('#list')) {
            currentPage = 'list';
            
            currentPageNum = 1;
            currentSort = 'fullName';
            currentSortOrder = 'asc';
            searchTerm = '';
            
            const parts = hash.split('/');
            for (let i = 0; i < parts.length; i++) {
                switch(parts[i]) {
                    case 'page':
                        currentPageNum = parseInt(parts[i + 1]) || 1;
                        i++;
                        break;
                    case 'sort':
                        currentSort = parts[i + 1] || 'fullName';
                        i++;
                        break;
                    case 'order':
                        currentSortOrder = parts[i + 1] || 'asc';
                        i++;
                        break;
                    case 'search':
                        searchTerm = decodeURIComponent(parts[i + 1] || '');
                        i++;
                        break;
                }
            }
            return;
        }
        
        currentPage = 'list';
        currentPageNum = 1;
        currentSort = 'fullName';
        currentSortOrder = 'asc';
        searchTerm = '';
    }
    
    function showMessage(text, type) {
        const messageDiv = document.getElementById('message');
        if (messageDiv) {
            messageDiv.textContent = text;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 3000);
        }
    }

    async function loadEmployees() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Ошибка загрузки');
            employees = await response.json();
            return employees;
        } catch (error) {
            console.error('Ошибка:', error);
            return [];
        }
    }

    function filterEmployees() {
        if (!searchTerm.trim()) {
            return [...employees];
        }
        const term = searchTerm.toLowerCase().trim();
        return employees.filter(emp => 
            emp.fullName.toLowerCase().includes(term) ||
            emp.id.toLowerCase().includes(term) ||
            emp.position.toLowerCase().includes(term) ||
            emp.department.toLowerCase().includes(term)
        );
    }

    function sortEmployees(data) {
        const sorted = [...data];
        sorted.sort((a, b) => {
            let valA = a[currentSort];
            let valB = b[currentSort];
            
            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }
            
            if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    function paginateData(data) {
        const start = (currentPageNum - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        return {
            items: data.slice(start, end),
            total: data.length,
            totalPages: Math.ceil(data.length / itemsPerPage)
        };
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function renderSortIcon(column) {
        if (currentSort !== column) return '↕️';
        return currentSortOrder === 'asc' ? '↑' : '↓';
    }

    function renderPagination(totalPages) {
        if (totalPages <= 1) return '';
        
        let html = '<div class="pagination">';
        
        html += `<button class="page-btn" onclick="changePage(1)" ${currentPageNum === 1 ? 'disabled' : ''}>⏮️</button>`;
        html += `<button class="page-btn" onclick="changePage(${currentPageNum - 1})" ${currentPageNum === 1 ? 'disabled' : ''}>◀</button>`;
        
        let startPage = Math.max(1, currentPageNum - 2);
        let endPage = Math.min(totalPages, currentPageNum + 2);
        
        if (startPage > 1) {
            html += `<button class="page-btn" onclick="changePage(1)">1</button>`;
            if (startPage > 2) html += `<span class="page-dots">...</span>`;
        }
        
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === currentPageNum ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span class="page-dots">...</span>`;
            html += `<button class="page-btn" onclick="changePage(${totalPages})">${totalPages}</button>`;
        }
        
        html += `<button class="page-btn" onclick="changePage(${currentPageNum + 1})" ${currentPageNum === totalPages ? 'disabled' : ''}>▶</button>`;
        html += `<button class="page-btn" onclick="changePage(${totalPages})" ${currentPageNum === totalPages ? 'disabled' : ''}>⏩</button>`;
        
        html += '</div>';
        return html;
    }

    function renderItemsPerPage() {
        return `
            <div class="per-page-selector">
                <span>Показывать:</span>
                <select onchange="changeItemsPerPage(this.value)">
                    <option value="5" ${itemsPerPage === 5 ? 'selected' : ''}>5</option>
                    <option value="10" ${itemsPerPage === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${itemsPerPage === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50</option>
                </select>
                <span>записей</span>
            </div>
        `;
    }

    function renderSearchBar() {
        return `
            <div class="search-bar">
                <input type="text" id="searchInput" placeholder="🔍 Поиск по ФИО, табельному номеру, должности или отделу..." value="${escapeHtml(searchTerm)}">
                <button class="btn-search" onclick="performSearch()">Найти</button>
                <button class="btn-clear" onclick="clearSearch()">Сброс</button>
            </div>
        `;
    }

    async function renderListPage() {
        const content = document.getElementById('app-content');
        if (!content) return;

        await loadEmployees();
        
        let filtered = filterEmployees();
        let sorted = sortEmployees(filtered);
        let paginated = paginateData(sorted);

        let html = `
            <div class="employees-page">
                <h2>👥 Список сотрудников</h2>
                
                ${renderSearchBar()}
                
                <div class="controls-bar">
                    ${renderItemsPerPage()}
                    <div class="stats-info">
                        Найдено: ${filtered.length} из ${employees.length}
                    </div>
                </div>
                
                <div id="message" class="message" style="display:none;"></div>
        `;

        if (paginated.items.length === 0) {
            html += '<div class="loading">📭 Нет данных. Измените параметры поиска.</div>';
        } else {
            html += `
                <div class="table-responsive">
                    <table class="employee-table">
                        <thead>
                            <tr>
                                <th class="sortable" onclick="sortBy('id')">Табельный номер ${renderSortIcon('id')}</th>
                                <th class="sortable" onclick="sortBy('fullName')">ФИО ${renderSortIcon('fullName')}</th>
                                <th class="sortable" onclick="sortBy('position')">Должность ${renderSortIcon('position')}</th>
                                <th class="sortable" onclick="sortBy('department')">Отдел ${renderSortIcon('department')}</th>
                                <th class="sortable" onclick="sortBy('hireDate')">Дата приема ${renderSortIcon('hireDate')}</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            paginated.items.forEach(emp => {
                html += `
                    <tr>
                        <td><strong>${escapeHtml(emp.id)}</strong></td>
                        <td>${escapeHtml(emp.fullName)}</td>
                        <td>${escapeHtml(emp.position)}</td>
                        <td><span class="department-badge">${escapeHtml(emp.department)}</span></td>
                        <td>${escapeHtml(emp.hireDate)}</td>
                        <td class="actions">
                            <button class="btn-edit" onclick="window.editEmployee('${emp.id}')">✏️ Ред</button>
                            <button class="btn-delete" onclick="window.deleteEmployee('${emp.id}')">🗑️ Удал</button>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            html += `<div class="pagination-info">
                        Страница ${currentPageNum} из ${paginated.totalPages} | 
                        Всего записей: ${paginated.total}
                    </div>`;
            html += renderPagination(paginated.totalPages);
        }

        html += `<button class="btn" onclick="window.navigateTo('add')" style="margin-top: 20px;">➕ Добавить сотрудника</button>`;
        html += `</div>`;

        content.innerHTML = html;
        
        saveStateToHash();
    }

    function renderAddPage() {
        const content = document.getElementById('app-content');
        if (!content) return;

        const html = `
            <div class="add-page">
                <h2>➕ Добавление нового сотрудника</h2>
                <div id="message" class="message" style="display:none;"></div>
                <div class="form-card">
                    <form id="addForm">
                        <div class="form-group">
                            <label>Табельный номер *</label>
                            <input type="text" id="id" placeholder="Пример: ТН-009" required>
                        </div>
                        <div class="form-group">
                            <label>ФИО *</label>
                            <input type="text" id="fullName" placeholder="Иванов Иван Иванович" required>
                        </div>
                        <div class="form-group">
                            <label>Должность *</label>
                            <input type="text" id="position" placeholder="Инженер" required>
                        </div>
                        <div class="form-group">
                            <label>Отдел *</label>
                            <input type="text" id="department" placeholder="IT отдел" required>
                        </div>
                        <div class="form-group">
                            <label>Дата приема *</label>
                            <input type="text" id="hireDate" placeholder="ДД.ММ.ГГГГ" required>
                        </div>
                        <div class="button-group">
                            <button type="submit" class="btn">💾 Сохранить</button>
                            <button type="button" class="btn btn-secondary" onclick="window.navigateTo('list')">❌ Отмена</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        content.innerHTML = html;

        document.getElementById('addForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const newEmployee = {
                id: document.getElementById('id').value.trim(),
                fullName: document.getElementById('fullName').value.trim(),
                position: document.getElementById('position').value.trim(),
                department: document.getElementById('department').value.trim(),
                hireDate: document.getElementById('hireDate').value.trim()
            };

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newEmployee)
                });

                if (response.ok) {
                    showMessage('✅ Сотрудник успешно добавлен', 'success');
                    setTimeout(() => window.navigateTo('list'), 1500);
                } else {
                    const error = await response.json();
                    showMessage('❌ ' + error.error, 'error');
                }
            } catch (error) {
                showMessage('❌ Ошибка при добавлении', 'error');
            }
        });
        
        window.location.hash = '#add';
    }

    async function renderEditPage(id) {
        const content = document.getElementById('app-content');
        if (!content) return;

        try {
            const response = await fetch(`${API_URL}/${id}`);
            if (!response.ok) throw new Error('Сотрудник не найден');
            const emp = await response.json();

            const html = `
                <div class="edit-page">
                    <h2>✏️ Редактирование сотрудника</h2>
                    <div id="message" class="message" style="display:none;"></div>
                    <div class="form-card">
                        <form id="editForm">
                            <div class="form-group">
                                <label>Табельный номер</label>
                                <input type="text" id="id" value="${escapeHtml(emp.id)}" disabled>
                                <input type="hidden" id="originalId" value="${emp.id}">
                            </div>
                            <div class="form-group">
                                <label>ФИО *</label>
                                <input type="text" id="fullName" value="${escapeHtml(emp.fullName)}" required>
                            </div>
                            <div class="form-group">
                                <label>Должность *</label>
                                <input type="text" id="position" value="${escapeHtml(emp.position)}" required>
                            </div>
                            <div class="form-group">
                                <label>Отдел *</label>
                                <input type="text" id="department" value="${escapeHtml(emp.department)}" required>
                            </div>
                            <div class="form-group">
                                <label>Дата приема *</label>
                                <input type="text" id="hireDate" value="${escapeHtml(emp.hireDate)}" required>
                            </div>
                            <div class="button-group">
                                <button type="submit" class="btn">💾 Сохранить</button>
                                <button type="button" class="btn btn-secondary" onclick="window.navigateTo('list')">❌ Отмена</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            content.innerHTML = html;

            document.getElementById('editForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const updatedEmployee = {
                    id: document.getElementById('originalId').value,
                    fullName: document.getElementById('fullName').value.trim(),
                    position: document.getElementById('position').value.trim(),
                    department: document.getElementById('department').value.trim(),
                    hireDate: document.getElementById('hireDate').value.trim()
                };

                try {
                    const response = await fetch(`${API_URL}/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedEmployee)
                    });

                    if (response.ok) {
                        showMessage('✅ Сотрудник успешно обновлен', 'success');
                        setTimeout(() => window.navigateTo('list'), 1500);
                    } else {
                        showMessage('❌ Ошибка при обновлении', 'error');
                    }
                } catch (error) {
                    showMessage('❌ Ошибка при обновлении', 'error');
                }
            });
            
            window.location.hash = '#edit/' + id;
        } catch (error) {
            showMessage('❌ Сотрудник не найден', 'error');
            setTimeout(() => window.navigateTo('list'), 1500);
        }
    }
    
    window.sortBy = function(column) {
        if (currentSort === column) {
            currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort = column;
            currentSortOrder = 'asc';
        }
        currentPageNum = 1;
        renderListPage();
    };

    window.changePage = function(page) {
        currentPageNum = page;
        renderListPage();
    };

    window.changeItemsPerPage = function(value) {
        itemsPerPage = parseInt(value);
        currentPageNum = 1;
        renderListPage();
    };

    window.performSearch = function() {
        searchTerm = document.getElementById('searchInput').value;
        currentPageNum = 1;
        renderListPage();
    };

    window.clearSearch = function() {
        searchTerm = '';
        currentPageNum = 1;
        renderListPage();
    };

    window.deleteEmployee = async function(id) {
        if (confirm(`Удалить сотрудника с табельным номером ${id}?`)) {
            try {
                const response = await fetch(`${API_URL}/${id}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    alert('✅ Сотрудник удален');
                    renderListPage();
                } else {
                    alert('❌ Ошибка при удалении');
                }
            } catch (error) {
                alert('❌ Ошибка при удалении');
            }
        }
    };

    window.editEmployee = function(id) {
        currentPage = 'edit';
        updateActiveNav();
        renderEditPage(id);
    };

    window.refreshList = function() {
        renderListPage();
    };

    window.navigateTo = function(page) {
        currentPage = page;
        updateActiveNav();
        
        if (page === 'list') {
            currentPageNum = 1;
            currentSort = 'fullName';
            currentSortOrder = 'asc';
            searchTerm = '';
            renderListPage();
        } else if (page === 'add') {
            renderAddPage();
        }
    };

    function updateActiveNav() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            const page = link.getAttribute('data-page');
            if ((currentPage === 'list' && page === 'list') ||
                (currentPage === 'add' && page === 'add')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    function handleHashChange() {
        const hash = window.location.hash;
        
        if (hash === '#add') {
            if (currentPage !== 'add') {
                currentPage = 'add';
                updateActiveNav();
                renderAddPage();
            }
        } else if (hash.startsWith('#edit/')) {
            const id = hash.split('/')[1];
            currentPage = 'edit';
            updateActiveNav();
            renderEditPage(id);
        } else {
            loadStateFromHash();
            updateActiveNav();
            renderListPage();
        }
    }
    
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (link.getAttribute('data-page')) {
                    window.navigateTo(link.getAttribute('data-page'));
                }
            });
        });

        loadStateFromHash();
        
        if (currentPage === 'add') {
            renderAddPage();
        } else if (currentPage === 'edit') {
            const id = window.location.hash.split('/')[1];
            renderEditPage(id);
        } else {
            renderListPage();
        }

        window.addEventListener('hashchange', handleHashChange);
    });
})();