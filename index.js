const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// REGISTER
app.post('/register', async (req,res)=>{
  try {
    const {username, email, phone, password, publicKey} = req.body;
    if(!username ||!email ||!phone ||!password) 
      return res.status(400).json({error:'Lengkapi semua data'});

    const hash = await bcrypt.hash(password,10);
    await pool.query(
      `INSERT INTO users(username,email,phone,password_hash,public_key) 
       VALUES($1,$2,$3,$4,$5)`,
      [username,email,phone,hash,publicKey]
    );
    res.json({ok:true});
  } catch(e) {
    if(e.code === '23505') return res.status(400).json({error:'Username/Email/No HP sudah terpakai'});
    res.status(500).json({error:e.message});
  }
});

// LOGIN - bisa pake username / email / no hp
app.post('/login', async (req,res)=>{
  try {
    const {identifier, password} = req.body;
    const {rows} = await pool.query(
      `SELECT * FROM users WHERE username=$1 OR email=$1 OR phone=$1`,
      [identifier]
    );
    if(!rows.length) return res.status(400).json({error:'User tidak ditemukan'});
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok) return res.status(400).json({error:'Password salah'});
    res.json({ok:true, userId:user.id, username:user.username});
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

// KIRIM PESAN
app.post('/send', async (req,res)=>{
  const {senderId, receiverId, ciphertext, iv} = req.body;
  await pool.query(
    `INSERT INTO messages(sender_id,receiver_id,ciphertext,iv) VALUES($1,$2,$3,$4)`,
    [senderId,receiverId,ciphertext,iv]
  );
  res.json({ok:true});
});

// AMBIL PESAN
app.get('/messages/:userId/:otherId', async (req,res)=>{
  const {userId, otherId} = req.params;
  const {rows} = await pool.query(
    `SELECT * FROM messages WHERE 
     (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)
     ORDER BY created_at ASC`,
    [userId, otherId]
  );
  res.json(rows);
});

// AMBIL DAFTAR USER
app.get('/users', async (req,res)=>{
  const {rows} = await pool.query(`SELECT id, username FROM users ORDER BY username`);
  res.json(rows);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Server jalan di '+PORT));
