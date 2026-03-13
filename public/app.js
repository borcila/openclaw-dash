// ===== Claw Monitor — Frontend =====

const API = window.location.hostname === 'localhost' ? '' : '';
let projectData = {};
let agentsData = [];
let tasksData = [];
let logsData = [];
let summariesData = [];
let agentMap = {};
let logsPaused = false;
let sseConnected = false;

// ===== INIT =====

async function init() {
  setupNav();
  await Promise.all([
    fetchStatus(),
    fetchAgents(),
    fetchTasks(),
    fetchLogs(),
    fetchSummaries(),
  ]);
  connectSSE();
  startUptimeTimer();
}

// ===== NAV =====

function setupNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('view-' + tab.dataset.view).classList.add('active');
    });
  });
}

// ===== FETCH =====

async function fetchJSON(url) {
  try {
    const res = await fetch(API + url);
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchStatus() {
  const data = await fetchJSON('/api/status');
  if (data) {
    projectData = data;
    renderHeader();
    renderStats();
  }
}

async function fetchAgents() {
  const data = await fetchJSON('/api/agents');
  if (data) {
    agentsData = data;
    agentMap = {};
    agentsData.forEach(a => agentMap[a.id] = a);
    renderAgents();
  }
}

async function fetchTasks() {
  const data = await fetchJSON('/api/tasks');
  if (data) {
    tasksData = data;
    renderTasks();
    renderStats();
  }
}

async function fetchLogs() {
  const data = await fetchJSON('/api/logs');
  if (data) {
    logsData = data;
    renderLogs();
  }
}

async function fetchSummaries() {
  const data = await fetchJSON('/api/summaries');
  if (data) {
    summariesData = data;
    renderSummaries();
  }
}

// ===== SSE =====

function connectSSE() {
  const es = new EventSource(API + '/api/logs/stream');

  es.onopen = () => {
    sseConnected = true;
    updateConnectionStatus('connected');
  };

  es.onerror = () => {
    sseConnected = false;
    updateConnectionStatus('disconnected');
  };

  es.addEventListener('agents', (e) => {
    agentsData = JSON.parse(e.data);
    agentMap = {};
    agentsData.forEach(a => agentMap[a.id] = a);
    renderAgents();
    renderStats();
  });

  es.addEventListener('tasks', (e) => {
    tasksData = JSON.parse(e.data);
    renderTasks();
    renderStats();
  });

  es.addEventListener('logs', (e) => {
    logsData = JSON.parse(e.data);
    renderLogs();
  });

  es.addEventListener('project', (e) => {
    projectData = { ...projectData, ...JSON.parse(e.data) };
    renderHeader();
  });

  es.addEventListener('summaries', (e) => {
    summariesData = JSON.parse(e.data);
    renderSummaries();
  });
}

function updateConnectionStatus(state) {
  const el = document.getElementById('connection-status');
  el.className = 'connection-status ' + state;
  el.querySelector('.connection-text').textContent =
    state === 'connected' ? 'Live' : state === 'disconnected' ? 'Offline' : 'Connecting';
}

// ===== RENDER: HEADER =====

function renderHeader() {
  document.getElementById('project-name').textContent = projectData.name || 'Claw Monitor';
  document.getElementById('project-desc').textContent = projectData.description || '';

  const total = tasksData.length || projectData.totalTasks || 0;
  const completed = tasksData.filter(t => t.status === 'done').length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  document.getElementById('progress-text').textContent = `${completed} / ${total} tasks`;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('session-count').textContent = projectData.totalSessions || summariesData.length || 0;
}

// ===== RENDER: AGENTS =====

function renderAgents() {
  const grid = document.getElementById('agents-grid');
  if (!agentsData.length) {
    grid.innerHTML = '<div class="empty-state">No agents active</div>';
    return;
  }
  grid.innerHTML = agentsData.map(agent => {
    const statusClass = agent.status;
    return `
      <div class="agent-card ${statusClass} fade-in">
        <div class="agent-card-header">
          <span class="agent-name">${esc(agent.name)}</span>
          <span class="agent-status ${statusClass}">${agent.status}</span>
        </div>
        <div class="agent-task">${esc(agent.task)}</div>
        ${agent.model ? '<div class="agent-model">' + esc(agent.model) + '</div>' : ''}
        <div class="agent-progress-label">
          <span>Progress</span>
          <span>${agent.progress || 0}%</span>
        </div>
        <div class="agent-progress-track">
          <div class="agent-progress-fill" style="width:${agent.progress || 0}%"></div>
        </div>
        <div class="agent-activity">${esc(agent.lastActivity || '')}</div>
      </div>
    `;
  }).join('');
}

// ===== RENDER: TASKS =====

function renderTasks() {
  const columns = { todo: [], 'in-progress': [], done: [], blocked: [] };
  tasksData.forEach(t => {
    if (columns[t.status]) columns[t.status].push(t);
  });

  for (const [status, tasks] of Object.entries(columns)) {
    const col = document.getElementById('col-' + status);
    const count = document.getElementById('count-' + status);
    count.textContent = tasks.length;
    col.innerHTML = tasks.map(t => {
      const assignee = agentMap[t.assignedTo];
      const assigneeName = assignee ? assignee.name : t.assignedTo || '—';
      return `
        <div class="task-card fade-in">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-meta">
            <span class="task-priority ${t.priority}">${t.priority}</span>
            <span class="task-assignee">${esc(assigneeName)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderHeader();
}

// ===== RENDER: LOGS =====

function renderLogs() {
  if (logsPaused) return;

  const container = document.getElementById('logs-container');
  const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;

  container.innerHTML = logsData.slice(-100).map(log => {
    const time = formatTime(log.timestamp);
    const agent = agentMap[log.agent];
    const agentName = agent ? agent.name : log.agent;
    return `
      <div class="log-entry ${log.type}">
        <div class="log-type-indicator"></div>
        <span class="log-time">${time}</span>
        <span class="log-agent">${esc(agentName)}</span>
        <span class="log-message">${esc(log.message)}</span>
      </div>
    `;
  }).join('');

  if (wasAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

const logsContainer = document.getElementById('logs-container');
const pauseBadge = document.getElementById('log-pause-badge');
logsContainer.addEventListener('mouseenter', () => { logsPaused = true; pauseBadge.style.display = 'inline-block'; });
logsContainer.addEventListener('mouseleave', () => { logsPaused = false; pauseBadge.style.display = 'none'; renderLogs(); });

// ===== RENDER: STATS =====

function renderStats() {
  const total = tasksData.length;
  const completed = tasksData.filter(t => t.status === 'done').length;
  const remaining = total - completed;
  const activeAgents = agentsData.filter(a => a.status === 'running').length;
  const errorCount = logsData.filter(l => l.type === 'error').length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-completed').textContent = completed;
  document.getElementById('stat-remaining').textContent = remaining;
  document.getElementById('stat-agents').textContent = activeAgents;
  document.getElementById('stat-errors').textContent = errorCount;

  const errorCard = document.getElementById('stat-error-card');
  errorCard.classList.toggle('has-errors', errorCount > 0);

  const etaEl = document.getElementById('stat-eta');
  if (completed > 0 && remaining > 0 && projectData.startedAt) {
    const elapsed = Date.now() - new Date(projectData.startedAt).getTime();
    const perTask = elapsed / completed;
    const etaMs = perTask * remaining;
    etaEl.textContent = formatDuration(etaMs);
  } else if (remaining === 0) {
    etaEl.textContent = 'Done';
  } else {
    etaEl.textContent = '--';
  }
}

// ===== RENDER: SUMMARIES (History Page) =====

function renderSummaries() {
  const search = (document.getElementById('history-search')?.value || '').toLowerCase();
  const filter = document.getElementById('history-filter')?.value || 'all';
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  let filtered = summariesData.filter(s => {
    if (search) {
      const haystack = (s.title + ' ' + (s.notes || '') + ' ' + (s.tags || []).join(' ')).toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (filter === 'today' && s.date !== todayStr) return false;
    if (filter === 'week') {
      const diff = (now - new Date(s.date)) / 86400000;
      if (diff > 7) return false;
    }
    if (filter === 'month') {
      const d = new Date(s.date);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
    }
    return true;
  });

  // Sort newest first
  filtered.sort((a, b) => new Date(b.completedAt || b.date) - new Date(a.completedAt || a.date));

  const countEl = document.getElementById('history-count');
  if (countEl) countEl.textContent = filtered.length + ' session' + (filtered.length !== 1 ? 's' : '');

  const list = document.getElementById('summaries-list');
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No session summaries yet. Complete sprints to see history here.</div>';
    return;
  }

  list.innerHTML = filtered.map(s => `
    <div class="summary-card" id="sc-${s.id}">
      <div class="summary-header" onclick="toggleSummary('${s.id}')">
        <div class="summary-header-left">
          <div class="summary-title">${esc(s.title)}</div>
          <div class="summary-meta">
            <span class="summary-meta-item">📅 ${formatDate(s.completedAt || s.date)}</span>
            <span class="summary-meta-item">⏱ ${esc(s.duration || 'N/A')}</span>
            <span class="summary-meta-item">✅ ${(s.tasksCompleted || []).length} tasks</span>
            <span class="summary-meta-item">🤖 ${(s.agentsUsed || []).length} agents</span>
          </div>
        </div>
        <div class="summary-header-right">
          ${(s.tags || []).map(t => '<span class="summary-tag">' + esc(t) + '</span>').join('')}
          <span class="summary-chevron" id="chevron-${s.id}">▸</span>
        </div>
      </div>
      <div class="summary-body" id="body-${s.id}">
        ${renderSummaryTasks(s.tasksCompleted)}
        ${renderSummaryAgents(s.agentsUsed)}
        ${s.notes ? `
          <div class="summary-section">
            <h4 class="summary-section-title">📝 Notes</h4>
            <div class="summary-notes">${esc(s.notes)}</div>
          </div>
        ` : ''}
        ${s.filesChanged && s.filesChanged.length ? `
          <div class="summary-section">
            <h4 class="summary-section-title">📁 Files Changed</h4>
            <div class="summary-files">${s.filesChanged.map(f => '<code>' + esc(f) + '</code>').join(' ')}</div>
          </div>
        ` : ''}
        <div class="summary-timestamps">
          Started: ${formatDate(s.startedAt)} ${formatTime(s.startedAt)} · Completed: ${formatDate(s.completedAt)} ${formatTime(s.completedAt)}
        </div>
      </div>
    </div>
  `).join('');
}

function renderSummaryTasks(tasks) {
  if (!tasks || !tasks.length) return '';
  return `
    <div class="summary-section">
      <h4 class="summary-section-title">✅ Tasks Completed</h4>
      ${tasks.map(t => `
        <div class="summary-task-row">
          <span class="summary-check">✓</span>
          <span class="summary-task-name">${esc(t.title)}</span>
          <span class="task-priority ${t.priority}">${t.priority}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSummaryAgents(agents) {
  if (!agents || !agents.length) return '';
  return `
    <div class="summary-section">
      <h4 class="summary-section-title">🤖 Agents Used</h4>
      ${agents.map(a => `
        <div class="summary-agent-row">
          <span class="summary-agent-dot">◆</span>
          <strong>${esc(a.name)}</strong>
          <span class="summary-agent-role">— ${esc(a.role)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function toggleSummary(id) {
  const body = document.getElementById('body-' + id);
  const chevron = document.getElementById('chevron-' + id);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open');
  chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
}

// ===== UPTIME TIMER =====

function startUptimeTimer() {
  function update() {
    if (projectData.startedAt) {
      const elapsed = Date.now() - new Date(projectData.startedAt).getTime();
      document.getElementById('uptime').textContent = formatDuration(elapsed);
    }
  }
  update();
  setInterval(update, 1000);
}

// ===== HELPERS =====

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ===== START =====
init();
