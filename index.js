const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const nodemailer = require('nodemailer'); // TAMBAHAN 1
const crypto = require('crypto'); // buat generate OTP
const app = express();

app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// CONFIG EMAIL - TAMBAHAN 2
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// FUNGSI GENERATE OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

// KIRIM OTP - TAMBAHAN 3
app.post('/send-otp', async (req,res)=>{
  try {
    const { email } = req.body;
    if(!email) return res.status(400).json({error:'Email wajib diisi'});

    // Cek email ada di DB ga
    const {rows} = await pool.query(`SELECT id FROM users WHERE email=$1`, [email]);
    if(!rows.length) return res.status(400).json({error:'Email belum terdaftar'});

    const otp = generateOTP();
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

    // Simpan OTP ke tabel otps. Bikin tabel dulu ya
    await pool.query(
      `INSERT INTO otps(email, otp, expires_at) VALUES($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET otp=$2, expires_at=$3`,
      [email, otp, expires]
    );

    const mailOptions = {
      from: `"Chat App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Kode OTP Chat App',
      text: `Kode OTP kamu adalah: ${otp}. Berlaku 5 menit. Jangan kasih ke siapapun.`
    };

    await transporter.sendMail(mailOptions);
    console.log("OTP TERKIRIM KE:", email);
    res.json({ok:true, message:'OTP terkirim ke email'});

  } catch(e) {
    console.error("GAGAL KIRIM OTP:", e);
    res.status(500).json({error: e.message});
  }
});

// VERIFIKASI OTP - TAMBAHAN 4
app.post('/verify-otp', async (req,res)=>{
  try {
    const { email, otp } = req.body;
    const {rows} = await pool.query(
      `SELECT * FROM otps WHERE email=$1 AND otp=$2 AND expires_at > NOW()`,
      [email, otp]
    );
    if(!rows.length) return res.status(400).json({error:'OTP salah atau kadaluarsa'});

    await pool.query(`DELETE FROM otps WHERE email=$1`, [email]); // hapus OTP setelah dipake
    res.json({ok:true, message:'OTP benar'});
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
