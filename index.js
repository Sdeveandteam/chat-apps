require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Server } = require('socket.io');
const { pool, initSchema } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'ganti-ini-di-env-production';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Paksa load chat.html biar ga cache
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ada' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token tidak valid' }); }
}

// REGISTER: bisa pake email atau phone
app.post('/api/register', async (req, res) => {
  const { username, password, publicKey, email, phone } = req.body;
  if (!username ||!password ||!publicKey) return res.status(400).json({ error: 'username, password, dan publicKey wajib' });
  if (!email &&!phone) return res.status(400).json({ error: 'email atau no hp wajib diisi 1' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, phone, password_hash, public_key) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, email, phone',
      [username.trim().toLowerCase(), email?.trim().toLowerCase() || null, phone?.trim() || null, hash, publicKey]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username/Email/No HP sudah dipakai' });
    console.error(err);
    res.status(500).json({ error: 'Gagal mendaftar' });
  }
});

// LOGIN: bisa pake username / email / phone
app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body; // identifier
  if(!identifier ||!password) return res.status(400).json({ error: 'Lengkapi semua' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username=$1 OR email=$1 OR phone=$1', [identifier.trim().toLowerCase()]);
    const user = result.rows[0]; if (!user) return res.status(401).json({ error: 'User tidak ditemukan' });
    const ok = await bcrypt.compare(password, user.password_hash); if (!ok) return res.status(401).json({ error: 'Password salah' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username }, publicKey: user.public_key });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Gagal login' }); }
});

app.get('/api/users/:username', authMiddleware, async (req, res) => {
  try { const result = await pool.query('SELECT id, username, email, phone, public_key FROM users WHERE username=$1', [req.params.username.trim().toLowerCase()]); if (!result.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan' }); res.json(result.rows[0]); }
  catch(err) { console.error(err); res.status(500).json({ error: 'Gagal cari user' }); }
});

app.get('/api/messages/:otherUserId', authMiddleware, async (req, res) => {
  try { const me = req.user.id; const other = parseInt(req.params.otherUserId, 10); const result = await pool.query(`SELECT id, sender_id, receiver_id, ciphertext, iv, created_at FROM messages WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1) ORDER BY created_at ASC LIMIT 200`, [me, other]); res.json(result.rows); }
  catch(err) { console.error(err); res.status(500).json({ error: 'Gagal ambil pesan' }); }
});

const onlineUsers = new Map();
io.use((socket, next) => { try { const token = socket.handshake.auth?.token; socket.user = jwt.verify(token, JWT_SECRET); next(); } catch { next(new Error('Autentikasi gagal')); } });
io.on('connection', (socket) => {
  const userId = socket.user.id; onlineUsers.set(userId, socket.id); console.log(`🟢 User ${socket.user.username} online`);
  socket.on('send_message', async ({ toUserId, ciphertext, iv }) => {
    try { const result = await pool.query('INSERT INTO messages (sender_id, receiver_id, ciphertext, iv) VALUES ($1,$2,$3,$4) RETURNING id, created_at', [userId, toUserId, ciphertext, iv]); const payload = { id: result.rows[0].id, fromUserId: userId, ciphertext, iv, createdAt: result.rows[0].created_at }; const targetSocket = onlineUsers.get(toUserId); if (targetSocket) io.to(targetSocket).emit('receive_message', payload); socket.emit('message_sent_ack', payload); }
    catch (err) { console.error(err); socket.emit('message_error', { error: 'Gagal mengirim pesan' }); }
  });
  socket.on('disconnect', () => { onlineUsers.delete(userId); console.log(`🔴 User ${socket.user.username} offline`); });
});

initSchema().then(() => { server.listen(PORT, () => console.log(`🚀 Server jalan di port ${PORT}`)); }).catch((err) => { console.error('Gagal inisialisasi database:', err); process.exit(1); });
