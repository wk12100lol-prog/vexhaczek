const plugins = require('./plugins');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'vexhack2026';

const users = new Map();
const pendingUsers = new Map();
let nextId = 1;

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];
  const path = url.replace('/api', '');

  if (path === '/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { username, password, screenshots } = JSON.parse(body);
        
        if (!username || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Brak nazwy użytkownika lub hasła!' }));
          return;
        }
        
        if ([...users.values(), ...pendingUsers.values()].some(u => u.username === username)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Użytkownik już istnieje!' }));
          return;
        }
        
        const userId = nextId++;
        pendingUsers.set(userId.toString(), {
          id: userId,
          username,
          password,
          screenshots: screenshots || [],
          createdAt: new Date().toISOString()
        });
        
        console.log(`📝 Nowy użytkownik czeka na akceptację: ${username}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Konto utworzone! Czekaj na akceptację administratora.' 
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Błąd serwera' }));
      }
    });
    return;
  }

  if (path === '/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { username, password } = JSON.parse(body);
        
        if (username === ADMIN_USER && password === ADMIN_PASS) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            isAdmin: true,
            token: 'admin_' + Date.now()
          }));
          return;
        }
        
        const user = [...users.values()].find(u => u.username === username && u.password === password);
        
        if (user) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            isAdmin: false,
            userId: user.id,
            username: user.username,
            token: 'user_' + user.id
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nieprawidłowy login lub hasło!' }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Błąd serwera' }));
      }
    });
    return;
  }

  if (path === '/pending' && req.method === 'GET') {
    const pending = [...pendingUsers.values()].map(u => ({
      id: u.id,
      username: u.username,
      screenshots: u.screenshots,
      createdAt: u.createdAt
    }));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pending));
    return;
  }

  if (path === '/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { userId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nieprawidłowe hasło admina!' }));
          return;
        }
        
        const user = pendingUsers.get(userId.toString());
        
        if (!user) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Użytkownik nie znaleziony!' }));
          return;
        }
        
        users.set(userId.toString(), {
          id: user.id,
          username: user.username,
          password: user.password,
          approved: true,
          approvedAt: new Date().toISOString()
        });
        
        pendingUsers.delete(userId.toString());
        
        console.log(`✅ Użytkownik zatwierdzony: ${user.username}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Użytkownik zatwierdzony!' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Błąd serwera' }));
      }
    });
    return;
  }

  if (path === '/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { userId, adminPassword } = JSON.parse(body);
        
        if (adminPassword !== ADMIN_PASS) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nieprawidłowe hasło admina!' }));
          return;
        }
        
        pendingUsers.delete(userId.toString());
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Użytkownik odrzucony!' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Błąd serwera' }));
      }
    });
    return;
  }

  if (path === '/plugins' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(plugins));
    return;
  }

  if (path === '/users' && req.method === 'GET') {
    const allUsers = [...users.values()].map(u => ({
      id: u.id,
      username: u.username,
      approvedAt: u.approvedAt
    }));
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(allUsers));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not found' }));
};