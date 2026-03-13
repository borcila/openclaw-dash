// ===== Claw Monitor — Frontend =====

// API base URL — set to your Cloudflare tunnel domain when deployed on Vercel
// Leave empty for local development (same-origin)
const API = window.CLAW_API_URL || localStorage.getItem('claw_api_url') || '';
let projectData = {};
let agentsData = [];
let tasksData = [];
let logsData = [];
let agentMap = {};
let logsPaused = false;
let sseConnected = false;

// ===== INIT =====

async function init() {
  await Promise.all([
    fetchStatus(),
    fetchAgents(),
    fetchTasks(),
    fetchLogs(),
  ]);
  connectSSE();
  startUptimeTimer();
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
}

// ===== RENDER: AGENTS =====

function renderAgents() {
  const grid = document.getElementById('agents-grid');
  grid.innerHTML = agentsData.map(agent => {
    const statusClass = agent.status;
    return `
      <div class="agent-card ${statusClass} fade-in">
        <div class="agent-card-header">
          <span class="agent-name">${esc(agent.name)}</span>
          <span class="agent-status ${statusClass}">${agent.status}</span>
        </div>
        <div class="agent-task">${esc(agent.task)}</div>
        <div class="agent-progress-label">
          <span>Progress</span>
          <span>${agent.progress}%</span>
        </div>
        <div class="agent-progress-track">
          <div class="agent-progress-fill" style="width:${agent.progress}%"></div>
        </div>
        <div class="agent-activity">${esc(agent.lastActivity)}</div>
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

// Pause auto-scroll on hover
const logsContainer = document.getElementById('logs-container');
const pauseBadge = document.getElementById('log-pause-badge');

logsContainer.addEventListener('mouseenter', () => {
  logsPaused = true;
  pauseBadge.style.display = 'inline-block';
});

logsContainer.addEventListener('mouseleave', () => {
  logsPaused = false;
  pauseBadge.style.display = 'none';
  renderLogs();
});

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
  if (errorCount > 0) {
    errorCard.classList.add('has-errors');
  } else {
    errorCard.classList.remove('has-errors');
  }

  // ETA estimate
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
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
