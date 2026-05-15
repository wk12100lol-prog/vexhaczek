const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_5pCtygfG0xNI@ep-bold-lake-aq5vn708-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function initTables() {
  const db = getPool();
  await db.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, screenshots JSONB DEFAULT '[]', approved BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, approved_at TIMESTAMP)`);
  await db.query(`CREATE TABLE IF NOT EXISTS plugins (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100) NOT NULL, description TEXT, link VARCHAR(500), code VARCHAR(20), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await db.query(`CREATE TABLE IF NOT EXISTS discord_codes (code VARCHAR(10) PRIMARY KEY, discord_id VARCHAR(50), discord_username VARCHAR(100), role_id VARCHAR(50), expires_at TIMESTAMP, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await db.query(`CREATE TABLE IF NOT EXISTS discord_users (discord_id VARCHAR(50) PRIMARY KEY, discord_username VARCHAR(100), role_id VARCHAR(50), linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  console.log('✅ Tabele gotowe!');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse body for POST
  if (!req.body) {
    req.body = {};
    if (req.method === 'POST') {
      const raw = await getBody(req);
      if (raw) try { req.body = JSON.parse(raw); } catch(e) {}
    }
  }

  try { await initTables(); } catch (e) { console.log('DB init error:', e.message); }
  const db = getPool();
  const url = req.url.split('?')[0];
  const q = Object.fromEntries(new URLSearchParams(req.url.split('?')[1] || ''));
  req.body = { ...q };

  // POST body parser
  if (req.method === 'POST') {
    try {
      req.body = await new Promise((ok) => {
        let raw = '';
        req.on('data', c => raw += c);
        req.on('end', () => ok(raw ? JSON.parse(raw) : q));
        setTimeout(() => ok(q), 3000);
      });
    } catch(e) { req.body = { ...q }; }
  }
    try {
      await new Promise((ok) => {
        let raw = '';
        req.on('data', c => raw += c);
        req.on('end', () => { if (raw) try { req.body = JSON.parse(raw); } catch(e) {} ok(); });
        setTimeout(ok, 3000);
      });
    } catch(e) {}
  }

  try {
    // TEST ECHO
    if (url === '/api/echo' && req.method === 'POST') {
      return res.json({ received: req.body, method: 'POST' });
    }

    // ADMIN LOGIN (GET with params)
    if (url === '/api/login') {
      const params = new URLSearchParams(req.url.split('?')[1] || '');
      const username = params.get('username') || req.body?.username;
      const password = params.get('password') || req.body?.password;
      if (username === 'admin' && password === 'vexhack2026') {
        return res.json({ success: true, isAdmin: true, token: 'admin_' + Date.now() });
      }
      try {
        const result = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2 AND approved = true', [username, password]);
        if (result.rows.length > 0) {
          return res.json({ success: true, isAdmin: false, userId: result.rows[0].id, token: 'user_' + result.rows[0].id });
        }
      } catch (e) {}
      return res.status(401).json({ error: 'Nieprawidłowy login lub hasło!' });
    }

    // REGISTER
    if (url === '/api/register' && req.method === 'POST') {
      const { username, password, screenshots } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Brak danych!' });

      const exists = await db.query('SELECT id FROM users WHERE username = $1', [username]);
      if (exists.rows.length > 0) return res.status(400).json({ error: 'Użytkownik już istnieje!' });

      await db.query('INSERT INTO users (username, password, screenshots) VALUES ($1, $2, $3)', [username, password, JSON.stringify(screenshots || [])]);
      console.log(`📝 Rejestracja: ${username}`);
      return res.json({ success: true, message: 'Konto utworzone! Czekaj na akceptację.' });
    }

    // PENDING
    if (url === '/api/pending' && req.method === 'GET') {
      const result = await db.query("SELECT id, username, screenshots, created_at::text FROM users WHERE approved = false ORDER BY created_at DESC");
      return res.json(result.rows.map(u => ({ id: u.id, username: u.username, screenshots: u.screenshots || [], createdAt: u.created_at })));
    }

    // APPROVE
    if (url === '/api/approve' && req.method === 'POST') {
      const { userId, adminPassword } = req.body;
      if (adminPassword !== 'vexhack2026') return res.status(401).json({ error: 'Nieprawidłowe hasło!' });
      await db.query('UPDATE users SET approved = true, approved_at = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
      return res.json({ success: true, message: 'Użytkownik zatwierdzony!' });
    }

    // REJECT
    if (url === '/api/reject' && req.method === 'POST') {
      const { userId, adminPassword } = req.body;
      if (adminPassword !== 'vexhack2026') return res.status(401).json({ error: 'Nieprawidłowe hasło!' });
      await db.query('DELETE FROM users WHERE id = $1 AND approved = false', [userId]);
      return res.json({ success: true, message: 'Użytkownik odrzucony!' });
    }

    // GET PLUGINS
    if (url === '/api/plugins' && req.method === 'GET') {
      const result = await db.query('SELECT * FROM plugins ORDER BY name ASC');
      return res.json(result.rows);
    }

    // ADD PLUGIN
    if (url === '/api/plugins/add' && req.method === 'POST') {
      const { name, description, link, code, adminPassword } = req.body;
      if (adminPassword !== 'vexhack2026') return res.status(401).json({ error: 'Nieprawidłowe hasło!' });
      const id = Math.random().toString(36).substring(2, 15);
      const code2 = code || Math.random().toString(36).substring(2, 10).toUpperCase();
      await db.query('INSERT INTO plugins (id, name, description, link, code) VALUES ($1, $2, $3, $4, $5)', [id, name, description || '', link, code2]);
      return res.json({ success: true, message: 'Plugin dodany!', plugin: { id, name, code: code2 } });
    }

    // DELETE PLUGIN
    if (url === '/api/plugins/delete' && req.method === 'POST') {
      const { pluginId, adminPassword } = req.body;
      if (adminPassword !== 'vexhack2026') return res.status(401).json({ error: 'Nieprawidłowe hasło!' });
      await db.query('DELETE FROM plugins WHERE id = $1', [pluginId]);
      return res.json({ success: true, message: 'Plugin usunięty!' });
    }

    // UPDATE PLUGIN
    if (url === '/api/plugins/update' && req.method === 'POST') {
      const { pluginId, name, description, link, code, adminPassword } = req.body;
      if (adminPassword !== 'vexhack2026') return res.status(401).json({ error: 'Nieprawidłowe hasło!' });
      await db.query('UPDATE plugins SET name = $1, description = $2, link = $3, code = $4 WHERE id = $5', [name, description, link, code, pluginId]);
      return res.json({ success: true, message: 'Plugin zaktualizowany!' });
    }

    // GET USERS
    if (url === '/api/users' && req.method === 'GET') {
      const result = await db.query("SELECT id, username, approved_at::text FROM users WHERE approved = true ORDER BY approved_at DESC");
      return res.json(result.rows.map(u => ({ id: u.id, username: u.username, approvedAt: u.approved_at })));
    }

    // DELETE USER
    if (url === '/api/users/delete' && req.method === 'POST') {
      const { userId, adminPassword } = req.body;
      if (adminPassword !== 'vexhack2026') return res.status(401).json({ error: 'Nieprawidłowe hasło!' });
      await db.query('DELETE FROM users WHERE id = $1', [userId]);
      return res.json({ success: true, message: 'Użytkownik usunięty!' });
    }

    // STATS
    if (url === '/api/stats' && req.method === 'GET') {
      const [plugins, users, pending] = await Promise.all([
        db.query('SELECT COUNT(*) FROM plugins'),
        db.query('SELECT COUNT(*) FROM users WHERE approved = true'),
        db.query('SELECT COUNT(*) FROM users WHERE approved = false')
      ]);
      return res.json({
        plugins: parseInt(plugins.rows[0].count),
        users: parseInt(users.rows[0].count),
        pending: parseInt(pending.rows[0].count)
      });
    }

    // SEED PLUGINS (admin only)
    if (url === '/api/seed' && req.method === 'POST') {
      const { adminPassword } = req.body;
      if (adminPassword !== 'vexhack2026') return res.status(401).json({ error: 'Nieprawidłowe hasło!' });

      const pluginsList = [
        {name:"Vexcody",desc:"Skrypt na /kod tiktok/start",link:"https://www.dropbox.com/scl/fi/wbs29j8j89zq8canpotc0/Vexhack.py-cody.sk?rlkey=bopsuip19ventzvvrnl3gedvh&dl=1",code:"CFOQ8067"},
        {name:"Vexantylogout",desc:"Plugin na antylogout 1.21.4",link:"https://www.dropbox.com/scl/fi/s05rm8ylt9y185h3t9br6/AntiLogout-1.0-SNAPSHOT.jar?rlkey=75zb7191eexewgpb0b1zbuk6x&dl=1",code:"QRJWAW28"},
        {name:"SercajakzANAs3",desc:"Skrypt na serca jak z Anarchi S3",link:"https://www.dropbox.com/scl/fi/ylp9l2o6bmb96gjly3r39/SercajakzANAs3.sk?rlkey=1xfh8o5zrebf6di4xw0wphf73&st=y2nt88r0&dl=1",code:"KCHXNJ5G"},
        {name:"VexVanish",desc:"Plugin na /vanish (niewidzialność)",link:"https://www.dropbox.com/scl/fi/rx1rkr34ydptdheva01yb/VexVanish.sk?rlkey=3rs9nlx3rgrzu872ecuahhb7y&st=m622owfu&dl=1",code:"X0428VP3"},
        {name:"PrezentyAnarchia",desc:"Skrypt na prezenty z anarchia.gg",link:"https://www.dropbox.com/scl/fi/tuiwyp8qien0pmia1ik88/prezentyzanarchia.gg.sk?rlkey=1q3ksx04u6v4ijlxiabinmhq4&dl=1",code:"AJV1LDH3"},
        {name:"Vexbackupy",desc:"Skrypt na backup ekwipunku",link:"https://www.dropbox.com/scl/fi/nzz7qrmfdxhg5jz5xa945/Vexbackupy2.sk?rlkey=22ja4a9r0bf5ahqi9csx3n312&st=qs5mfnah&dl=1",code:"RC1P16AV"},
        {name:"VexKosz",desc:"Skrypt na /kosz",link:"https://www.dropbox.com/scl/fi/0ja4gmiq9ber93d460whw/Vexkosz.sk?rlkey=oxw7vx4tdy5o4d1gvts4ux3qi&dl=1",code:"J315PYJW"},
        {name:"Vexczeki",desc:"Plugin na /czek jak z anarchi",link:"https://www.dropbox.com/scl/fi/1xit6zyj5x7i2zh75uuht/Vexczeki.sk?rlkey=f6pvns88tctyq0gcrwilr6047&st=r1jep49x&dl=1",code:"UXFH5B32"},
        {name:"Vexmesage",desc:"Skrypt na auto wiadomości co 2 min",link:"https://www.dropbox.com/scl/fi/mcgkyiwmy8i7c4k37s7jj/Vexmesage.sk?rlkey=ozlrg904esnh8ju352z61x4ae&st=3fjqniut&dl=1",code:"NA9WXREG"},
        {name:"Vextpa",desc:"System teleportacji /tpa",link:"https://www.dropbox.com/scl/fi/cljyt6zwdpnoh2vhrvm8e/Vextpa.sk?rlkey=qildwbzffnppwjdyju6f681v3&st=g08ffhxn&dl=1",code:"CJE8GGHX"},
        {name:"Vexhelpop",desc:"Skrypt na /helpop",link:"https://www.dropbox.com/scl/fi/s5n0bfbt87x3t32fxo0sb/Vexhelpop.sk?rlkey=rovivoe83x6j5992wn7bvnqmz&st=ggfqbtes&dl=1",code:"FDMYCYTX"},
        {name:"Vexchapta",desc:"Skrypt na chapta (antybot)",link:"https://www.dropbox.com/scl/fi/z4poeenv8klztcr76022r/Vexchapta.sk?rlkey=36tjpf7anfx2vyf96xsinxb5t&st=e8lj7nr7&dl=1",code:"ZFWHIOVD"},
        {name:"Vexogłoszenia",desc:"Skrypt na /ogl [wiadomość]",link:"https://www.dropbox.com/scl/fi/8yqrhiukau0z3rian9vm4/Vexog-oszenia.sk?rlkey=wit4sn2ifgfvoz5vc9o9257id&st=uxvhyywm&dl=1",code:"HUVT5QLK"},
        {name:"Vexpanel-1.0",desc:"Panel administracyjny 1.21.4",link:"https://www.dropbox.com/scl/fi/v406h7ksdz2qi2unhkf82/VexPanel-1.0.jar?rlkey=ayvaai0ou4dqfld96rwlsld34&dl=1",code:"VFFZ9AHQ"},
        {name:"Vexitemy",desc:"Plugin na itemy z anarchi.gg",link:"https://www.dropbox.com/scl/fi/cbsy4jldpafkwzwcpg1t9/vexitemy.jar?rlkey=grh342g802jxjlngfqafxlhhn&dl=1",code:"VP5N907G"},
        {name:"Maszyna-1.0",desc:"Maszyna hazardowa 1.21.4",link:"https://www.dropbox.com/scl/fi/rryt8ybcl3d4vjyd3lwdd/Maszyna-1.0.jar?rlkey=e309ikucvpry2r6i0i35b141c&dl=1",code:"2GNZFQ0N"},
        {name:"vexclient-1.21.4",desc:"Client z cheatami (klawisz V)",link:"https://www.dropbox.com/scl/fi/vme3ljb42h1lxly1197hd/vexclient.jar?rlkey=yujv5avgih5gh5wmlg5sagy9m&dl=1",code:"TH67T2SM"},
        {name:"Vexincognito",desc:"Skrypt na /incognito (zmiana nicku)",link:"https://www.dropbox.com/scl/fi/gs416fclota5ne1xik3w7/Vexincognito.sk?rlkey=2odw2rrj54ui2fkx2thqfw5a1&st=isz5rrk2&dl=1",code:"OP72XB6N"},
        {name:"Boty z odcinka",desc:"3 boty z odcinka YouTube",link:"https://www.mediafire.com/file/pl8f2k0z74vyzj0/boty.rar/file",code:"FBJSU7FZ"},
        {name:"Code bot",desc:"Bot na code na serwer",link:"https://www.dropbox.com/scl/fi/7a2d00rjz857tcmozn57m/code-bot.zip?rlkey=lp5x2sfw0dqm5essiurhtfwmz&dl=1",code:"Y1S4J3KN"},
        {name:"vexsystem",desc:"Panel instalowalny do MC",link:"https://www.mediafire.com/file/c8jbrjylma10alc/VexServer-Setup.exe/file",code:"OYQQKRFF"},
        {name:"vexserver",desc:"System lokalnych serwerów MC",link:"https://www.mediafire.com/file/c8jbrjylma10alc/VexServer-Setup.exe/file",code:"9QL7CGAH"},
        {name:"vexserver 1.2",desc:"Panel do zarządzania serwerem MC",link:"https://www.mediafire.com/file/ufv9cxi1yww5hbt/VexServer-Setup.exe/file",code:"A34JPJI0"},
        {name:"CS2 Plugin",desc:"Plugin dodający CS2 do MC",link:"https://www.mediafire.com/file/ao6imez8fexn8bi/CS2Plugin-1.0.0.jar/file",code:"W43WUU2S"},
        {name:"Sabotarzysta",desc:"Plugin na sabotarzystę w MC",link:"https://www.mediafire.com/file/03vsxlhk5ishoi0/sabo-plugin-1.0.0.jar/file",code:"6OYW5QKG"},
        {name:"Wiadro",desc:"Plugin na losowe wiadro",link:"https://www.mediafire.com/file/sbrd0zst4zwyzzn/wiadro-event-plugin-1.0.1.jar/file",code:"8PRN149G"},
        {name:"Zręczność Plugin",desc:"Gra zręcznościowa (dodatek)",link:"https://www.mediafire.com/file/clr0y0r7ygektj4/zrecznosc-plugin-1.0.0.jar/file",code:"K7JH2HQJ"},
        {name:"Sabotaz 1.3.0",desc:"Plugin na sabotarzystę v1.3.0",link:"https://www.mediafire.com/file/va82p0fs5aduu4y/SabotazPlugin-1.3.0.jar/file",code:"NPBV1PWI"}
      ];

      let added = 0;
      for (const p of pluginsList) {
        try {
          const id = Math.random().toString(36).substring(2, 15);
          await db.query('INSERT INTO plugins (id, name, description, link, code) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [id, p.name, p.desc, p.link, p.code]);
          added++;
        } catch (e) {}
      }

      return res.json({ success: true, message: `Wstawiono ${added} pluginów!` });
    }

    // DISCORD: BOT STORES CODE
    if (url === '/api/discord/code' && req.method === 'POST') {
      const { code, discordId, discordUsername, discordRole } = req.body;
      const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await db.query('INSERT INTO discord_codes (code, discord_id, discord_username, role_id, expires_at) VALUES ($1,$2,$3,$4,$5)', [code, discordId, discordUsername, discordRole, expires]);
      return res.json({ success: true });
    }

    // DISCORD: USER VERIFIES CODE
    if (url === '/api/discord/verify' && req.method === 'POST') {
      const { code } = req.body;
      const result = await db.query('SELECT * FROM discord_codes WHERE code = $1 AND used = false AND expires_at > NOW()', [code]);
      if (result.rows.length === 0) return res.status(400).json({ error: 'Nieprawidłowy lub wygasły kod!' });

      const data = result.rows[0];
      await db.query('UPDATE discord_codes SET used = true WHERE code = $1', [code]);
      await db.query('INSERT INTO discord_users (discord_id, discord_username, role_id) VALUES ($1,$2,$3) ON CONFLICT (discord_id) DO UPDATE SET discord_username = $2', [data.discord_id, data.discord_username, data.role_id]);

      return res.json({ success: true, discordId: data.discord_id, discordUsername: data.discord_username, message: 'Zweryfikowano przez Discord!' });
    }

    // DISCORD: CHECK IF USER IS VERIFIED
    if (url === '/api/discord/check' && req.method === 'POST') {
      const { discordId } = req.body;
      const result = await db.query('SELECT * FROM discord_users WHERE discord_id = $1', [discordId]);
      if (result.rows.length > 0) return res.json({ linked: true, user: result.rows[0] });
      return res.json({ linked: false });
    }

    return res.status(404).json({ message: 'Not found' });

  } catch (e) {
    return res.status(500).json({ error: 'Błąd serwera' });
  }
};