// ========================================
// TikTok LIVE Battle Arena - Game Client
// ========================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Game State ---
const state = {
  round: 1,
  maxRounds: 5,
  roundTime: 120, // seconds per round
  timeLeft: 120,
  totalCoins: 0,
  viewers: 0,
  gameOver: false,

  teams: {
    red: { hp: 1000, maxHp: 1000, power: 0, members: {}, color: '#ff4444', x: 0, y: 0 },
    blue: { hp: 1000, maxHp: 1000, power: 0, members: {}, color: '#4488ff', x: 0, y: 0 },
  },

  players: {}, // id -> { name, team, power, avatar, x, y }
  particles: [],
  projectiles: [],
  floatingTexts: [],
  effects: [],
};

// --- Canvas Setup ---
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  state.teams.red.x = canvas.width * 0.25;
  state.teams.red.y = canvas.height * 0.55;
  state.teams.blue.x = canvas.width * 0.75;
  state.teams.blue.y = canvas.height * 0.55;
}
window.addEventListener('resize', resize);
resize();

// --- WebSocket Connection ---
const ws = new WebSocket(`ws://${location.host}`);

ws.onopen = () => console.log('Connected to game server');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleEvent(data);
};

ws.onclose = () => {
  console.log('Disconnected, reconnecting...');
  setTimeout(() => location.reload(), 3000);
};

// --- Event Handler ---
function handleEvent(data) {
  switch (data.type) {
    case 'connected':
      state.viewers = data.viewers || 0;
      updateHUD();
      break;

    case 'joinTeam':
      addPlayerToTeam(data.user, data.team);
      break;

    case 'gift':
      handleGift(data.user, data.gift);
      break;

    case 'like':
      handleLike(data.user, data.count);
      break;

    case 'member':
      // Auto-assign to team with fewer members
      const redCount = Object.keys(state.teams.red.members).length;
      const blueCount = Object.keys(state.teams.blue.members).length;
      const team = redCount <= blueCount ? 'red' : 'blue';
      addPlayerToTeam(data.user, team);
      break;

    case 'share':
      if (state.players[data.user.id]) {
        const p = state.players[data.user.id];
        const t = state.teams[p.team];
        t.power += 5;
        addFloatingText(`+5 SHARE`, t.x, t.y - 60, '#44ff88');
      }
      break;

    case 'follow':
      if (state.players[data.user.id]) {
        const p = state.players[data.user.id];
        const t = state.teams[p.team];
        t.power += 10;
        t.hp = Math.min(t.maxHp, t.hp + 20);
        addFloatingText(`+10 FOLLOW`, t.x, t.y - 60, '#ffd700');
      }
      break;

    case 'viewers':
      state.viewers = data.count;
      updateHUD();
      break;

    case 'streamEnd':
      endGame('Stream Ended');
      break;
  }
}

// --- Player Management ---
function addPlayerToTeam(user, team) {
  if (state.gameOver) return;

  // Remove from other team if already joined
  const existing = state.players[user.id];
  if (existing) {
    delete state.teams[existing.team].members[user.id];
  }

  const teamData = state.teams[team];
  const angle = Math.random() * Math.PI * 2;
  const dist = 50 + Math.random() * 100;

  state.players[user.id] = {
    id: user.id,
    name: user.name,
    uniqueId: user.uniqueId,
    avatar: user.avatar,
    avatarImg: null,
    team,
    power: existing ? existing.power : 0,
    x: teamData.x + Math.cos(angle) * dist,
    y: teamData.y + Math.sin(angle) * dist,
    targetX: teamData.x + Math.cos(angle) * dist,
    targetY: teamData.y + Math.sin(angle) * dist,
    scale: 1,
    joinTime: Date.now(),
  };

  teamData.members[user.id] = true;

  // Load avatar image
  if (user.avatar) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = user.avatar;
    img.onload = () => {
      if (state.players[user.id]) {
        state.players[user.id].avatarImg = img;
      }
    };
  }

  spawnParticles(state.players[user.id].x, state.players[user.id].y, teamData.color, 10);
  addFloatingText(`${user.name} joined!`, teamData.x, teamData.y - 40, teamData.color);
  updateHUD();
}

// --- Gift Handling ---
function handleGift(user, gift) {
  if (state.gameOver) return;

  // Auto-join if not in a team
  if (!state.players[user.id]) {
    const redCount = Object.keys(state.teams.red.members).length;
    const blueCount = Object.keys(state.teams.blue.members).length;
    addPlayerToTeam(user, redCount <= blueCount ? 'red' : 'blue');
  }

  const player = state.players[user.id];
  if (!player) return;

  const myTeam = player.team;
  const enemyTeam = myTeam === 'red' ? 'blue' : 'red';
  const myTeamData = state.teams[myTeam];
  const enemyTeamData = state.teams[enemyTeam];

  player.power += gift.power;
  myTeamData.power += gift.power;
  state.totalCoins += gift.coins;

  switch (gift.action) {
    case 'attack':
      enemyTeamData.hp = Math.max(0, enemyTeamData.hp - gift.power);
      fireProjectile(myTeamData, enemyTeamData, myTeamData.color, gift.power, false);
      addFloatingText(`-${gift.power}`, enemyTeamData.x, enemyTeamData.y - 20, '#ff4444');
      spawnParticles(enemyTeamData.x, enemyTeamData.y, '#ff4444', 5);
      break;

    case 'superAttack':
      enemyTeamData.hp = Math.max(0, enemyTeamData.hp - gift.power);
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          fireProjectile(myTeamData, enemyTeamData, '#ffaa00', gift.power / 3, false);
        }, i * 150);
      }
      addFloatingText(`-${gift.power} ⚔️`, enemyTeamData.x, enemyTeamData.y - 30, '#ffaa00');
      spawnParticles(enemyTeamData.x, enemyTeamData.y, '#ffaa00', 15);
      shakeScreen(5);
      break;

    case 'ultimate':
      enemyTeamData.hp = Math.max(0, enemyTeamData.hp - gift.power);
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          fireProjectile(myTeamData, enemyTeamData, '#ffd700', gift.power / 8, true);
        }, i * 100);
      }
      addFloatingText(`💥 -${gift.power} ULTIMATE!`, enemyTeamData.x, enemyTeamData.y - 50, '#ffd700');
      spawnParticles(enemyTeamData.x, enemyTeamData.y, '#ffd700', 30);
      addExplosion(enemyTeamData.x, enemyTeamData.y);
      shakeScreen(15);
      break;

    case 'heal':
      myTeamData.hp = Math.min(myTeamData.maxHp, myTeamData.hp + gift.power);
      addFloatingText(`+${gift.power} ❤️`, myTeamData.x, myTeamData.y - 20, '#44ff88');
      spawnParticles(myTeamData.x, myTeamData.y, '#44ff88', 8);
      break;

    case 'shield':
      myTeamData.hp = Math.min(myTeamData.maxHp, myTeamData.hp + gift.power);
      addFloatingText(`🛡️ +${gift.power}`, myTeamData.x, myTeamData.y - 20, '#44aaff');
      spawnParticles(myTeamData.x, myTeamData.y, '#44aaff', 8);
      break;
  }

  // Add to gift feed
  addGiftFeed(user, gift);

  // Check HP
  if (enemyTeamData.hp <= 0) {
    endRound(myTeam);
  }

  updateHUD();
}

// --- Like Handling ---
function handleLike(user, count) {
  if (!state.players[user.id] || state.gameOver) return;

  const player = state.players[user.id];
  const myTeam = state.teams[player.team];
  const boost = Math.min(count, 20);
  myTeam.power += boost;
  player.power += boost;

  spawnParticles(player.x, player.y, '#ff69b4', 3);
}

// --- Projectiles ---
function fireProjectile(from, to, color, power, isUltimate) {
  state.projectiles.push({
    x: from.x,
    y: from.y,
    targetX: to.x + (Math.random() - 0.5) * 80,
    targetY: to.y + (Math.random() - 0.5) * 80,
    color,
    size: isUltimate ? 12 : 6,
    speed: 8 + Math.random() * 4,
    power,
    trail: [],
    isUltimate,
  });
}

// --- Particles ---
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      color,
      size: 2 + Math.random() * 4,
      life: 1,
      decay: 0.01 + Math.random() * 0.03,
    });
  }
}

function addExplosion(x, y) {
  for (let i = 0; i < 40; i++) {
    const angle = (Math.PI * 2 * i) / 40;
    const speed = 3 + Math.random() * 8;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: ['#ffd700', '#ff4444', '#ff8800', '#ffffff'][Math.floor(Math.random() * 4)],
      size: 3 + Math.random() * 6,
      life: 1,
      decay: 0.015,
    });
  }
}

// --- Floating Texts ---
function addFloatingText(text, x, y, color) {
  state.floatingTexts.push({
    text, x: x + (Math.random() - 0.5) * 40, y,
    color, life: 1, vy: -1.5,
  });
}

// --- Screen Shake ---
let shakeAmount = 0;
function shakeScreen(amount) {
  shakeAmount = Math.max(shakeAmount, amount);
}

// --- Gift Feed UI ---
function addGiftFeed(user, gift) {
  const feed = document.getElementById('gift-feed');
  const entry = document.createElement('div');
  entry.className = `gift-entry ${gift.action}`;
  entry.innerHTML = `
    ${user.avatar ? `<img class="gift-avatar" src="${user.avatar}" onerror="this.style.display='none'">` : '<div class="gift-avatar"></div>'}
    <span class="gift-name">${user.name}</span>
    <span class="gift-icon">${gift.icon}</span>
    <span>x${gift.count}</span>
    <span class="gift-power">+${gift.power}</span>
  `;
  feed.appendChild(entry);
  setTimeout(() => entry.remove(), 5000);

  // Keep max 8 entries
  while (feed.children.length > 8) {
    feed.removeChild(feed.firstChild);
  }
}

// --- HUD Update ---
function updateHUD() {
  const red = state.teams.red;
  const blue = state.teams.blue;

  // HP bars
  document.getElementById('red-hp-bar').style.width = `${(red.hp / red.maxHp) * 100}%`;
  document.getElementById('blue-hp-bar').style.width = `${(blue.hp / blue.maxHp) * 100}%`;
  document.getElementById('red-hp-text').textContent = Math.round(red.hp);
  document.getElementById('blue-hp-text').textContent = Math.round(blue.hp);

  // Power
  document.getElementById('red-power').textContent = `⚔️ ${formatNumber(red.power)}`;
  document.getElementById('blue-power').textContent = `⚔️ ${formatNumber(blue.power)}`;

  // Members
  document.getElementById('red-members').textContent = `👥 ${Object.keys(red.members).length}`;
  document.getElementById('blue-members').textContent = `👥 ${Object.keys(blue.members).length}`;

  // Center
  document.getElementById('round-info').textContent = `ROUND ${state.round} / ${state.maxRounds}`;
  document.getElementById('viewer-count').textContent = `👁️ ${formatNumber(state.viewers)}`;
  document.getElementById('total-coins').textContent = `💰 ${formatNumber(state.totalCoins)} coins`;

  // Timer
  const mins = Math.floor(state.timeLeft / 60);
  const secs = state.timeLeft % 60;
  document.getElementById('timer').textContent = `⏱️ ${mins}:${secs.toString().padStart(2, '0')}`;

  // Leaderboard
  updateLeaderboard();
}

function updateLeaderboard() {
  const sorted = Object.values(state.players)
    .sort((a, b) => b.power - a.power)
    .slice(0, 8);

  const list = document.getElementById('lb-list');
  list.innerHTML = sorted.map((p, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = i < 3 ? medals[i] : `#${i + 1}`;
    const dotColor = state.teams[p.team]?.color || '#888';
    return `
      <div class="lb-entry">
        <span class="lb-rank">${medal}</span>
        <div class="lb-team-dot" style="background:${dotColor}"></div>
        ${p.avatarImg || p.avatar ? `<img class="lb-avatar" src="${p.avatar}" onerror="this.style.display='none'">` : '<div class="lb-avatar"></div>'}
        <span class="lb-name">${p.name}</span>
        <span class="lb-score">❤️ ${formatNumber(p.power)}</span>
      </div>
    `;
  }).join('');
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// --- Round Management ---
function endRound(winnerTeam) {
  const announcement = document.getElementById('winner-announcement');
  const text = document.getElementById('winner-text');
  const color = state.teams[winnerTeam].color;

  text.style.color = color;
  text.innerHTML = `${winnerTeam === 'red' ? '🔴' : '🔵'} ${winnerTeam.toUpperCase()} TEAM WINS ROUND ${state.round}!`;
  announcement.classList.remove('hidden');

  setTimeout(() => {
    announcement.classList.add('hidden');
    state.round++;

    if (state.round > state.maxRounds) {
      endGame(winnerTeam);
    } else {
      // Reset HP, increase max for next round
      const bonus = state.round * 200;
      state.teams.red.maxHp = 1000 + bonus;
      state.teams.blue.maxHp = 1000 + bonus;
      state.teams.red.hp = state.teams.red.maxHp;
      state.teams.blue.hp = state.teams.blue.maxHp;
      state.timeLeft = state.roundTime;
      updateHUD();
    }
  }, 3000);
}

function endGame(winner) {
  state.gameOver = true;
  const announcement = document.getElementById('winner-announcement');
  const text = document.getElementById('winner-text');

  const redPower = state.teams.red.power;
  const bluePower = state.teams.blue.power;
  const finalWinner = redPower > bluePower ? 'red' : 'blue';

  text.style.color = state.teams[finalWinner].color;
  text.innerHTML = `
    🏆 ${finalWinner.toUpperCase()} TEAM WINS! 🏆<br>
    <span style="font-size:24px">
      🔴 ${formatNumber(redPower)} vs ${formatNumber(bluePower)} 🔵<br>
      💰 Total: ${formatNumber(state.totalCoins)} coins
    </span>
  `;
  announcement.classList.remove('hidden');

  // Restart after 15 seconds
  setTimeout(() => {
    resetGame();
  }, 15000);
}

function resetGame() {
  state.round = 1;
  state.timeLeft = state.roundTime;
  state.totalCoins = 0;
  state.gameOver = false;
  state.teams.red = { hp: 1000, maxHp: 1000, power: 0, members: {}, color: '#ff4444', x: state.teams.red.x, y: state.teams.red.y };
  state.teams.blue = { hp: 1000, maxHp: 1000, power: 0, members: {}, color: '#4488ff', x: state.teams.blue.x, y: state.teams.blue.y };
  state.players = {};
  state.particles = [];
  state.projectiles = [];
  state.floatingTexts = [];
  document.getElementById('winner-announcement').classList.add('hidden');
  updateHUD();
}

// --- Timer ---
setInterval(() => {
  if (state.gameOver) return;
  if (state.timeLeft > 0) {
    state.timeLeft--;
    updateHUD();
  } else {
    // Time's up - team with more HP wins the round
    const winner = state.teams.red.hp >= state.teams.blue.hp ? 'red' : 'blue';
    endRound(winner);
  }
}, 1000);

// ========================================
// RENDERING
// ========================================

function drawBackground() {
  // Dark gradient
  const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 100, canvas.width / 2, canvas.height / 2, canvas.width);
  grad.addColorStop(0, '#1a1a3e');
  grad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const gridSize = 60;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // VS divider line
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 100);
  ctx.lineTo(canvas.width / 2, canvas.height - 50);
  ctx.stroke();
  ctx.setLineDash([]);

  // VS text
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = 'bold 60px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('VS', canvas.width / 2, canvas.height / 2);
}

function drawTeamBase(team, teamData) {
  const x = teamData.x;
  const y = teamData.y;
  const hpPercent = teamData.hp / teamData.maxHp;

  // Glow
  const glowRadius = 80 + Math.sin(Date.now() / 500) * 10;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  glow.addColorStop(0, teamData.color + '40');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2);

  // Base circle
  ctx.beginPath();
  ctx.arc(x, y, 40, 0, Math.PI * 2);
  ctx.fillStyle = teamData.color + '30';
  ctx.fill();
  ctx.strokeStyle = teamData.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // HP arc
  ctx.beginPath();
  ctx.arc(x, y, 45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpPercent);
  ctx.strokeStyle = teamData.color;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Team icon
  ctx.fillStyle = teamData.color;
  ctx.font = 'bold 30px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(team === 'red' ? '⚔️' : '🛡️', x, y);
}

function drawPlayers() {
  Object.values(state.players).forEach(player => {
    // Smooth movement
    player.x += (player.targetX - player.x) * 0.05;
    player.y += (player.targetY - player.y) * 0.05;

    // Wander
    if (Math.random() < 0.01) {
      const team = state.teams[player.team];
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 120;
      player.targetX = team.x + Math.cos(angle) * dist;
      player.targetY = team.y + Math.sin(angle) * dist;
    }

    const size = 16 + Math.min(player.power / 100, 10);

    // Player circle
    if (player.avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(player.x, player.y, size, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(player.avatarImg, player.x - size, player.y - size, size * 2, size * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(player.x, player.y, size, 0, Math.PI * 2);
      ctx.fillStyle = state.teams[player.team].color + '80';
      ctx.fill();
    }

    // Border
    ctx.beginPath();
    ctx.arc(player.x, player.y, size, 0, Math.PI * 2);
    ctx.strokeStyle = state.teams[player.team].color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y + size + 12);

    // Power badge
    if (player.power > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 9px Arial';
      ctx.fillText(`${formatNumber(player.power)}`, player.x, player.y - size - 4);
    }
  });
}

function drawProjectiles() {
  state.projectiles.forEach((p, i) => {
    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) {
      spawnParticles(p.x, p.y, p.color, p.isUltimate ? 15 : 5);
      state.projectiles.splice(i, 1);
      return;
    }

    p.x += (dx / dist) * p.speed;
    p.y += (dy / dist) * p.speed;

    // Trail
    p.trail.push({ x: p.x, y: p.y, life: 1 });
    if (p.trail.length > 15) p.trail.shift();

    // Draw trail
    p.trail.forEach((t, j) => {
      t.life -= 0.07;
      ctx.beginPath();
      ctx.arc(t.x, t.y, p.size * t.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.floor(t.life * 255).toString(16).padStart(2, '0');
      ctx.fill();
    });

    // Draw projectile
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    if (p.isUltimate) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff80';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

function drawParticles() {
  state.particles.forEach((p, i) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1; // gravity
    p.life -= p.decay;

    if (p.life <= 0) {
      state.particles.splice(i, 1);
      return;
    }

    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawFloatingTexts() {
  state.floatingTexts.forEach((t, i) => {
    t.y += t.vy;
    t.life -= 0.015;

    if (t.life <= 0) {
      state.floatingTexts.splice(i, 1);
      return;
    }

    ctx.globalAlpha = t.life;
    ctx.fillStyle = t.color;
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y);
    ctx.globalAlpha = 1;
  });
}

// --- Passive Power Ticks ---
setInterval(() => {
  if (state.gameOver) return;

  ['red', 'blue'].forEach(team => {
    const t = state.teams[team];
    const memberCount = Object.keys(t.members).length;
    if (memberCount > 0) {
      // Passive damage based on team power
      const enemy = team === 'red' ? 'blue' : 'red';
      const passiveDmg = Math.floor(t.power * 0.001 * memberCount);
      if (passiveDmg > 0) {
        state.teams[enemy].hp = Math.max(0, state.teams[enemy].hp - passiveDmg);
        if (Math.random() < 0.1) {
          fireProjectile(t, state.teams[enemy], t.color + '80', passiveDmg, false);
        }
      }
    }
  });

  if (state.teams.red.hp <= 0) endRound('blue');
  if (state.teams.blue.hp <= 0) endRound('red');
  updateHUD();
}, 2000);

// --- Main Render Loop ---
function render() {
  ctx.save();

  // Screen shake
  if (shakeAmount > 0) {
    ctx.translate(
      (Math.random() - 0.5) * shakeAmount * 2,
      (Math.random() - 0.5) * shakeAmount * 2
    );
    shakeAmount *= 0.9;
    if (shakeAmount < 0.5) shakeAmount = 0;
  }

  drawBackground();
  drawTeamBase('red', state.teams.red);
  drawTeamBase('blue', state.teams.blue);
  drawPlayers();
  drawProjectiles();
  drawParticles();
  drawFloatingTexts();

  ctx.restore();
  requestAnimationFrame(render);
}

render();
updateHUD();

console.log('🎮 Battle Arena loaded!');
