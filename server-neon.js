// Neon Database Configuration
// Ustaw zmienną środowiskową DATABASE_URL w Neon dashboard
const DATABASE_URL = 'postgresql://neondb_owner:npg_3TehoqAMrPU8@ep-dark-bread-aqinhdkp-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'vexhack2026';

// In-memory cache for faster reads
let pluginsCache = [];
let usersCache = [];
let pendingCache = [];

async function initDB() {
  console.log('📦 Łączenie z Neon database...');
  
  try {
    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        screenshots JSONB DEFAULT '[]',
        approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plugins (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        link VARCHAR(500),
        code VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Load plugins
    const pluginsResult = await pool.query('SELECT * FROM plugins ORDER BY created_at DESC');
    pluginsCache = pluginsResult.rows;
    
    // Load users
    const usersResult = await pool.query('SELECT * FROM users WHERE approved = true');
    usersCache = usersResult.rows;
    
    const pendingResult = await pool.query('SELECT * FROM users WHERE approved = false');
    pendingCache = pendingResult.rows;
    
    console.log(`✅ Załadowano ${pluginsCache.length} pluginów, ${usersCache.length} użytkowników`);
    console.log('✅ Połączono z Neon!');
  } catch (error) {
    console.log('⚠️ Nie można połączyć z Neon - używam pamięci RAM');
    try {
      pluginsCache = require('./plugins');
    } catch (e) {
      pluginsCache = [];
    }
  }
}

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

  // REGISTER
  if (url === '/api/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { username, password, screenshots } = JSON.parse(body);
        
        if (!username || !password) {
          sendJSON(res, 400, { error: 'Brak nazwy użytkownika lub hasła!' });
          return;
        }
        
        // Check if exists
        const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (exists.rows.length > 0) {
          sendJSON(res, 400, { error: 'Użytkownik już istnieje!' });
          return;
        }
        
        // Insert to Neon
        await pool.query(
          'INSERT INTO users (username, password, screenshots) VALUES ($1, $2, $3)',
          [username, password, JSON.stringify(screenshots || [])]
        );
        
        pendingCache.push({ id: Date.now(), username, createdAt: new Date().toISOString() });
        
        console.log(`📝 Rejestracja: ${username}`);
        sendJSON(res, 200, { success: true, message: 'Konto utworzone! Czekaj na akceptację.' });
      } catch (e) {
        // Fallback to memory
        const { username, password, screenshots } = JSON.parse(body);
        if (!username || !password) {
          sendJSON(res, 400, { error: 'Brak nazwy!' });
          return;
        }
        pendingCache.push({ id: Date.now(), username, screenshots, createdAt: new Date().toISOString() });
        sendJSON(res, 200, { success: true, message: 'Konto utworzone!' });
      }
    });
    return;
  }

  // LOGIN
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
        
        // Check Neon
        pool.query('SELECT * FROM users WHERE username = $1 AND password = $2 AND approved = true', [username, password])
          .then(result => {
            if (result.rows.length > 0) {
              sendJSON(res, 200, { success: true, isAdmin: false, userId: result.rows[0].id, username, token: 'user_' + result.rows[0].id });
            } else {
              sendJSON(res, 401, { error: 'Nieprawidłowy login lub hasło!' });
            }
          });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // GET PENDING
  if (url === '/api/pending' && req.method === 'GET') {
    pool.query('SELECT id, username, screenshots, created_at FROM users WHERE approved = false ORDER BY created_at DESC')
      .then(result => {
        sendJSON(res, 200, result.rows.map(u => ({
          id: u.id,
          username: u.username,
          screenshots: u.screenshots || [],
          createdAt: u.created_at
        })));
      })
      .catch(() => sendJSON(res, 200, pendingCache.map(u => ({ id: u.id, username: u.username, screenshots: u.screenshots || [], createdAt: u.createdAt }))));
    return;
  }

  // APPROVE
  if (url === '/api/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { userId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        await pool.query('UPDATE users SET approved = true, approved_at = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
        
        console.log(`✅ Zatwierdzony ID: ${userId}`);
        sendJSON(res, 200, { success: true, message: 'Użytkownik zatwierdzony!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // REJECT
  if (url === '/api/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { userId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        await pool.query('DELETE FROM users WHERE id = $1 AND approved = false', [userId]);
        
        console.log(`❌ Odrzucony ID: ${userId}`);
        sendJSON(res, 200, { success: true, message: 'Użytkownik odrzucony!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // GET PLUGINS
  if (url === '/api/plugins' && req.method === 'GET') {
    pool.query('SELECT * FROM plugins ORDER BY created_at DESC')
      .then(result => sendJSON(res, 200, result.rows))
      .catch(() => sendJSON(res, 200, pluginsCache));
    return;
  }

  // ADD PLUGIN
  if (url === '/api/plugins/add' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { name, description, link, code, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        const id = generateId();
        await pool.query(
          'INSERT INTO plugins (id, name, description, link, code) VALUES ($1, $2, $3, $4, $5)',
          [id, name, description || '', link, code || generateCode()]
        );
        
        console.log(`✅ Dodano plugin: ${name}`);
        sendJSON(res, 200, { success: true, message: 'Plugin dodany!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // DELETE PLUGIN
  if (url === '/api/plugins/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { pluginId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        await pool.query('DELETE FROM plugins WHERE id = $1', [pluginId]);
        
        console.log(`❌ Usunięto plugin: ${pluginId}`);
        sendJSON(res, 200, { success: true, message: 'Plugin usunięty!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // UPDATE PLUGIN
  if (url === '/api/plugins/update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { pluginId, name, description, link, code, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        await pool.query(
          'UPDATE plugins SET name = $1, description = $2, link = $3, code = $4 WHERE id = $5',
          [name, description || '', link, code || '', pluginId]
        );
        
        console.log(`✏️ Zaktualizowano plugin: ${name}`);
        sendJSON(res, 200, { success: true, message: 'Plugin zaktualizowany!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // GET USERS
  if (url === '/api/users' && req.method === 'GET') {
    pool.query('SELECT id, username, approved_at FROM users WHERE approved = true ORDER BY approved_at DESC')
      .then(result => sendJSON(res, 200, result.rows.map(u => ({
        id: u.id,
        username: u.username,
        approvedAt: u.approved_at
      }))))
      .catch(() => sendJSON(res, 200, []));
    return;
  }

  // DELETE USER
  if (url === '/api/users/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { userId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          sendJSON(res, 401, { error: 'Nieprawidłowe hasło admina!' });
          return;
        }
        
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        
        console.log(`❌ Usunięto użytkownika ID: ${userId}`);
        sendJSON(res, 200, { success: true, message: 'Użytkownik usunięty!' });
      } catch (e) {
        sendJSON(res, 500, { error: 'Błąd serwera' });
      }
    });
    return;
  }

  // STATS
  if (url === '/api/stats' && req.method === 'GET') {
    Promise.all([
      pool.query('SELECT COUNT(*) FROM plugins'),
      pool.query('SELECT COUNT(*) FROM users WHERE approved = true'),
      pool.query('SELECT COUNT(*) FROM users WHERE approved = false')
    ]).then(([p, u, pen]) => {
      sendJSON(res, 200, {
        plugins: parseInt(p.rows[0].count),
        users: parseInt(u.rows[0].count),
        pending: parseInt(pen.rows[0].count)
      });
    }).catch(() => {
      sendJSON(res, 200, { plugins: pluginsCache.length, users: usersCache.length, pending: pendingCache.length });
    });
    return;
  }

  // STATIC FILES
  const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
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

const http = require('http');

initDB().then(() => {
  server.listen(3000, () => {
    console.log(`
╔═══════════════════════════════════╗
║   🚀 VexPanel Server Started!    ║
╠═══════════════════════════════════╣
║   🌐 http://localhost:3000        ║
║   👑 Admin: admin / vexhack2026   ║
║   🗄️  Baza: Neon PostgreSQL       ║
╚═══════════════════════════════════╝
    `);
  });
});