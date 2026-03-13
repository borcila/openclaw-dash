const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

const app = express();
const PORT = 3777;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---

function readJSON(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return filename.endsWith('.json') && !filename.includes('project') ? [] : {};
  }
}

function writeJSON(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- SSE ---

const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

app.get('/api/logs/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(':\n\n'); // heartbeat
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Heartbeat every 15s to keep connections alive
setInterval(() => {
  for (const res of sseClients) {
    res.write(':\n\n');
  }
}, 15000);

// --- File watcher ---

const watcher = chokidar.watch(DATA_DIR, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
});

watcher.on('change', (filepath) => {
  const basename = path.basename(filepath);
  const eventMap = {
    'agents.json': 'agents',
    'tasks.json': 'tasks',
    'logs.json': 'logs',
    'project.json': 'project',
  };
  const event = eventMap[basename];
  if (event) {
    const data = readJSON(basename);
    broadcast(event, data);
  }
});

// --- API Routes ---

app.get('/api/status', (req, res) => {
  const project = readJSON('project.json');
  const agents = readJSON('agents.json');
  const tasks = readJSON('tasks.json');
  const logs = readJSON('logs.json');

  const completedTasks = tasks.filter((t) => t.status === 'done').length;
  const errorCount = logs.filter((l) => l.type === 'error').length;

  res.json({
    ...project,
    totalTasks: tasks.length,
    completedTasks,
    activeAgents: agents.filter((a) => a.status === 'running').length,
    errorCount,
  });
});

app.get('/api/agents', (req, res) => {
  res.json(readJSON('agents.json'));
});

app.get('/api/tasks', (req, res) => {
  res.json(readJSON('tasks.json'));
});

app.get('/api/logs', (req, res) => {
  const logs = readJSON('logs.json');
  res.json(logs.slice(-100));
});

app.post('/api/logs', (req, res) => {
  const logs = readJSON('logs.json');
  const entry = {
    timestamp: new Date().toISOString(),
    ...req.body,
  };
  logs.push(entry);
  writeJSON('logs.json', logs);
  broadcast('logs', logs.slice(-100));
  res.json({ ok: true, entry });
});

app.post('/api/agents', (req, res) => {
  const agents = readJSON('agents.json');
  const { id, ...updates } = req.body;
  const idx = agents.findIndex((a) => a.id === id);
  if (idx !== -1) {
    agents[idx] = { ...agents[idx], ...updates };
  } else {
    agents.push(req.body);
  }
  writeJSON('agents.json', agents);
  broadcast('agents', agents);
  res.json({ ok: true });
});

app.post('/api/tasks', (req, res) => {
  const tasks = readJSON('tasks.json');
  const { id, ...updates } = req.body;
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx !== -1) {
    tasks[idx] = { ...tasks[idx], ...updates };
  } else {
    tasks.push(req.body);
  }
  writeJSON('tasks.json', tasks);
  broadcast('tasks', tasks);
  res.json({ ok: true });
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`\n  🐾 Claw Monitor running at http://localhost:${PORT}\n`);
});
