const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- Comptes utilisateurs, sauvegardés dans users.json ---
const USERS_FILE = path.join(__dirname, 'users.json');
let users = {};
if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// --- Personnes en ligne : socket.id -> nom ---
const online = new Map();
function sendOnlineList() {
  io.emit('online', [...new Set(online.values())]);
}

io.on('connection', (socket) => {
  // Inscription
  socket.on('register', async ({ username, password }, reply) => {
    username = String(username || '').trim();
    password = String(password || '');
    if (username.length < 3 || username.length > 20) {
      return reply({ ok: false, error: 'Le nom doit faire entre 3 et 20 caractères.' });
    }
    if (password.length < 6) {
      return reply({ ok: false, error: 'Le mot de passe doit faire au moins 6 caractères.' });
    }
    const key = username.toLowerCase();
    if (users[key]) {
      return reply({ ok: false, error: 'Ce nom est déjà pris.' });
    }
    users[key] = { name: username, hash: await bcrypt.hash(password, 10) };
    saveUsers();
    online.set(socket.id, username);
    sendOnlineList();
    reply({ ok: true, username });
  });

  // Connexion
  socket.on('login', async ({ username, password }, reply) => {
    const key = String(username || '').trim().toLowerCase();
    const user = users[key];
    if (!user || !(await bcrypt.compare(String(password || ''), user.hash))) {
      return reply({ ok: false, error: 'Nom ou mot de passe incorrect.' });
    }
    online.set(socket.id, user.name);
    sendOnlineList();
    reply({ ok: true, username: user.name });
  });

  // Message (seulement si connecté)
  socket.on('message', (text) => {
    const name = online.get(socket.id);
    if (!name) return;
    text = String(text || '').trim().slice(0, 1000);
    if (!text) return;
    io.emit('message', { name, text, time: Date.now() });
  });

  socket.on('disconnect', () => {
    online.delete(socket.id);
    sendOnlineList();
  });
});

server.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});