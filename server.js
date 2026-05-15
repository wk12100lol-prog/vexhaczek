const http = require('http');
const fs = require('fs');
const path = require('path');

// Neon Database Configuration
const NEON_CONFIG = {
  connectionString: 'postgresql://username:password@ep-xxx-xxx-12345.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: true
};

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'vexhack2026';

let users = [];
let pendingUsers = [];
let plugins = [];
let nextId = 1;

// Simple in-memory cache (replace with Neon DB queries in production)
async function initDB() {
  console.log('📦 Łączenie z Neon database...');
  // For demo - using in-memory storage
  // In production, use 'pg' library to connect to Neon:
  // const { Pool } = require('pg');
  // const pool = new Pool({ connectionString: NEON_CONFIG.connectionString, ssl: { rejectUnauthorized: false } });
  
  // Load plugins from file
  try {
    plugins = require('./plugins');
    console.log(`✅ Załadowano ${plugins.length} pluginów`);
  } catch (e) {
    plugins = [];
  }
  
  // Demo data
  pendingUsers = [];
  users = [];
  nextId = 1;
  
  console.log('✅ Baza danych gotowa!');
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css'
};

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // ========== REGISTER ==========
  if (url === '/api/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { username, password, screenshots } = JSON.parse(body);
        
        if (!username || !password) {
          sendJSON(res, 400, { error: 'Brak nazwy użytkownika lub hasła!' });
          return;
        }
        
        if ([...users, ...pendingUsers].some(u => u.username === username)) {
          sendJSON(res, 400, { error: 'Użytkownik już istnieje!' });
          return;
        }
        
        const userId = nextId++;
        pendingUsers.push({
          id: userId,
          username,
          password,
          screenshots: screenshots || [],
          createdAt: new Date().toISOString()
        });
        
        console.log(`📝 Nowy użytkownik: ${username}`);
        sendJSON(res, 200, { success: true, message: 'Konto utworzone! Czekaj na akceptację.' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // ========== LOGIN ==========
  if (url === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        
        if (username === ADMIN_USER && password === ADMIN_PASS) {
          sendJSON(res, 200, { success: true, isAdmin: true, token: 'admin_' + Date.now() });
          return;
        }
        
        const user = users.find(u => u.username === username && u.password === password);
        
        if (user) {
          sendJSON(res, 200, { success: true, isAdmin: false, userId: user.id, username: user.username, token: 'user_' + user.id });
        } else {
          sendJSON(res, 401, { error: 'Nieprawidłowy login lub hasło!' });
        }
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // ========== PENDING USERS ==========
  if (url === '/api/pending' && req.method === 'GET') {
    sendJSON(res, 200, pendingUsers.map(u => ({
      id: u.id,
      username: u.username,
      screenshots: u.screenshots,
      createdAt: u.createdAt
    })));
    return;
  }

  // ========== APPROVE USER ==========
  if (url === '/api/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { userId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        const userIndex = pendingUsers.findIndex(u => u.id == userId);
        if (userIndex === -1) {
          sendJSON(res, 404, { error: 'Użytkownik nie znaleziony!' });
          return;
        }
        
        const user = pendingUsers.splice(userIndex, 1)[0];
        user.approved = true;
        user.approvedAt = new Date().toISOString();
        users.push(user);
        
        console.log(`✅ Zatwierdzony: ${user.username}`);
        sendJSON(res, 200, { success: true, message: 'Użytkownik zatwierdzony!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // ========== REJECT USER ==========
  if (url === '/api/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { userId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        pendingUsers = pendingUsers.filter(u => u.id != userId);
        sendJSON(res, 200, { success: true, message: 'Użytkownik odrzucony!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // ========== GET PLUGINS ==========
  if (url === '/api/plugins' && req.method === 'GET') {
    sendJSON(res, 200, plugins);
    return;
  }

  // ========== ADD PLUGIN ==========
  if (url === '/api/plugins/add' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, description, link, code, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        if (!name || !link) {
          sendJSON(res, 400, { error: 'Nazwa i link są wymagane!' });
          return;
        }
        
        const newPlugin = {
          id: generateId(),
          name,
          description: description || '',
          link,
          code: code || generateCode(),
          plugin_id: generateId()
        };
        
        plugins.push(newPlugin);
        
        // Save to file (in production - save to Neon DB)
        savePlugins();
        
        console.log(`✅ Dodano plugin: ${name}`);
        sendJSON(res, 200, { success: true, plugin: newPlugin, message: 'Plugin dodany!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // ========== DELETE PLUGIN ==========
  if (url === '/api/plugins/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { pluginId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        const pluginIndex = plugins.findIndex(p => p.id === pluginId);
        if (pluginIndex === -1) {
          sendJSON(res, 404, { error: 'Plugin nie znaleziony!' });
          return;
        }
        
        const plugin = plugins.splice(pluginIndex, 1)[0];
        savePlugins();
        
        console.log(`❌ Usunięto plugin: ${plugin.name}`);
        sendJSON(res, 200, { success: true, message: 'Plugin usunięty!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // ========== UPDATE PLUGIN ==========
  if (url === '/api/plugins/update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { pluginId, name, description, link, code, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        const pluginIndex = plugins.findIndex(p => p.id === pluginId);
        if (pluginIndex === -1) {
          sendJSON(res, 404, { error: 'Plugin nie znaleziony!' });
          return;
        }
        
        plugins[pluginIndex] = {
          ...plugins[pluginIndex],
          name: name || plugins[pluginIndex].name,
          description: description !== undefined ? description : plugins[pluginIndex].description,
          link: link || plugins[pluginIndex].link,
          code: code || plugins[pluginIndex].code
        };
        
        savePlugins();
        
        console.log(`✏️ Zaktualizowano plugin: ${plugins[pluginIndex].name}`);
        sendJSON(res, 200, { success: true, plugin: plugins[pluginIndex], message: 'Plugin zaktualizowany!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // ========== GET USERS ==========
  if (url === '/api/users' && req.method === 'GET') {
    sendJSON(res, 200, users.map(u => ({
      id: u.id,
      username: u.username,
      approvedAt: u.approvedAt
    })));
    return;
  }

  // ========== DELETE USER ==========
  if (url === '/api/users/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { userId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        const user = users.find(u => u.id == userId);
        if (user) {
          console.log(`❌ Usunięto użytkownika: ${user.username}`);
        }
        
        users = users.filter(u => u.id != userId);
        sendJSON(res, 200, { success: true, message: 'Użytkownik usunięty!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // ========== STATS ==========
  if (url === '/api/stats' && req.method === 'GET') {
    sendJSON(res, 200, {
      plugins: plugins.length,
      users: users.length,
      pending: pendingUsers.length
    });
    return;
  }

  // ========== STATIC FILES ==========
  let filePath = url === '/' ? '/index.html' : url;
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/html';

  const allowedPages = ['/index.html', '/register.html', '/login.html', '/dashboard.html', '/admin.html'];
  if (allowedPages.includes(filePath)) {
    fs.readFile(path.join(__dirname, filePath), (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('404');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('404');
});

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function generateCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function savePlugins() {
  const data = `module.exports = ${JSON.stringify(plugins, null, 4)};`;
  fs.writeFileSync(path.join(__dirname, 'plugins.js'), data);
}

initDB().then(() => {
  server.listen(3000, () => {
    console.log(`
╔═══════════════════════════════════╗
║   🚀 VexPanel Server Started!      ║
╠═══════════════════════════════════╣
║   🌐 http://localhost:3000        ║
║   👑 Admin: admin / vexhack2026   ║
║   🗄️  Baza: Neon (PostgreSQL)      ║
╚═══════════════════════════════════╝
    `);
  });
});