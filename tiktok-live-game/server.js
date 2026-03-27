const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// --- Configuration ---
const TIKTOK_USERNAME = process.argv[2] || 'your_username';
const PORT = process.env.PORT || 3000;
const DEMO_MODE = process.argv.includes('--demo');

// --- Gift Configuration (TikTok gift values in coins) ---
const GIFT_ACTIONS = {
  // Small gifts (1-10 coins) -> Basic attacks
  'Rose': { action: 'attack', power: 10, name: 'Rose', icon: '🌹', coins: 1 },
  'GG': { action: 'attack', power: 15, name: 'GG', icon: '🎯', coins: 1 },
  'Ice Cream Cone': { action: 'attack', power: 12, name: 'Ice Cream', icon: '🍦', coins: 1 },
  'Heart Me': { action: 'heal', power: 20, name: 'Heart', icon: '❤️', coins: 5 },
  'Team Bracelet': { action: 'shield', power: 15, name: 'Shield', icon: '🛡️', coins: 2 },
  'Finger Heart': { action: 'attack', power: 18, name: 'Finger Heart', icon: '🫰', coins: 5 },
  'Doughnut': { action: 'heal', power: 25, name: 'Doughnut', icon: '🍩', coins: 5 },
  // Medium gifts (10-100 coins) -> Strong attacks
  'Perfume': { action: 'superAttack', power: 50, name: 'Perfume', icon: '✨', coins: 20 },
  'Cap': { action: 'superAttack', power: 40, name: 'Cap', icon: '🧢', coins: 10 },
  '手花火': { action: 'superAttack', power: 55, name: 'Handheld Firework', icon: '🎆', coins: 10 },
  'Love You': { action: 'superAttack', power: 60, name: 'Love You', icon: '💕', coins: 25 },
  'Hand Hearts': { action: 'superAttack', power: 45, name: 'Hand Hearts', icon: '💞', coins: 10 },
  'Gold Mine': { action: 'superAttack', power: 70, name: 'Gold Mine', icon: '⛏️', coins: 50 },
  // Big gifts (100+ coins) -> Ultimate attacks
  'Drama Queen': { action: 'ultimate', power: 150, name: 'Drama Queen', icon: '👑', coins: 100 },
  'Lion': { action: 'ultimate', power: 200, name: 'Lion', icon: '🦁', coins: 500 },
  'Universe': { action: 'ultimate', power: 500, name: 'Universe', icon: '🌌', coins: 1000 },
  'Planet': { action: 'ultimate', power: 300, name: 'Planet', icon: '🪐', coins: 200 },
  'Rocket': { action: 'ultimate', power: 250, name: 'Rocket', icon: '🚀', coins: 150 },
  'TikTok Universe': { action: 'ultimate', power: 1000, name: 'TikTok Universe', icon: '🌟', coins: 5000 },
};

// Default action for unknown gifts
function getGiftAction(giftName, diamondCount) {
  if (GIFT_ACTIONS[giftName]) return GIFT_ACTIONS[giftName];
  // Fallback based on diamond count
  if (diamondCount >= 100) return { action: 'ultimate', power: diamondCount * 2, name: giftName, icon: '💎', coins: diamondCount };
  if (diamondCount >= 10) return { action: 'superAttack', power: diamondCount * 2, name: giftName, icon: '⚔️', coins: diamondCount };
  return { action: 'attack', power: Math.max(10, diamondCount * 3), name: giftName, icon: '⚡', coins: diamondCount };
}

// --- Broadcast to all connected game clients ---
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// --- TikTok LIVE Connection ---
function connectToTikTok() {
  if (DEMO_MODE) {
    console.log('🎮 Running in DEMO mode - simulating TikTok events');
    startDemoMode();
    return;
  }

  console.log(`🔗 Connecting to TikTok LIVE: @${TIKTOK_USERNAME}`);

  const tiktok = new WebcastPushConnection(TIKTOK_USERNAME, {
    processInitialData: true,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 1000,
  });

  tiktok.connect()
    .then(state => {
      console.log(`✅ Connected! Room ID: ${state.roomId}, Viewers: ${state.viewerCount}`);
      broadcast({ type: 'connected', roomId: state.roomId, viewers: state.viewerCount });
    })
    .catch(err => {
      console.error('❌ Connection failed:', err.message);
      console.log('🔄 Retrying in 10 seconds...');
      setTimeout(connectToTikTok, 10000);
    });

  // --- Chat: Join a team ---
  tiktok.on('chat', (data) => {
    const comment = data.comment.trim().toLowerCase();
    const user = {
      id: data.userId,
      name: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl,
      uniqueId: data.uniqueId,
    };

    // Team join commands
    if (['1', 'red', 'אדום'].includes(comment)) {
      broadcast({ type: 'joinTeam', user, team: 'red' });
    } else if (['2', 'blue', 'כחול'].includes(comment)) {
      broadcast({ type: 'joinTeam', user, team: 'blue' });
    }

    broadcast({ type: 'chat', user, message: data.comment });
  });

  // --- Gifts: Trigger game actions ---
  tiktok.on('gift', (data) => {
    // Only process when the streak ends or for non-streak gifts
    if (data.giftType === 1 && !data.repeatEnd) return;

    const user = {
      id: data.userId,
      name: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl,
      uniqueId: data.uniqueId,
    };

    const repeatCount = data.repeatCount || 1;
    const giftAction = getGiftAction(data.giftName, data.diamondCount || 1);
    const totalPower = giftAction.power * repeatCount;

    broadcast({
      type: 'gift',
      user,
      gift: {
        name: giftAction.name,
        icon: giftAction.icon,
        action: giftAction.action,
        power: totalPower,
        count: repeatCount,
        coins: (giftAction.coins || 1) * repeatCount,
      },
    });

    console.log(`🎁 ${user.name} sent x${repeatCount} ${giftAction.icon} ${giftAction.name} (${giftAction.action}: ${totalPower} power)`);
  });

  // --- Likes: Small boost ---
  tiktok.on('like', (data) => {
    const user = {
      id: data.userId,
      name: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl,
      uniqueId: data.uniqueId,
    };
    broadcast({
      type: 'like',
      user,
      count: data.likeCount || 1,
    });
  });

  // --- Member join ---
  tiktok.on('member', (data) => {
    const user = {
      id: data.userId,
      name: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl,
      uniqueId: data.uniqueId,
    };
    broadcast({ type: 'member', user });
  });

  // --- Share ---
  tiktok.on('share', (data) => {
    const user = {
      id: data.userId,
      name: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl,
      uniqueId: data.uniqueId,
    };
    broadcast({ type: 'share', user });
  });

  // --- Follow ---
  tiktok.on('follow', (data) => {
    const user = {
      id: data.userId,
      name: data.nickname || data.uniqueId,
      avatar: data.profilePictureUrl,
      uniqueId: data.uniqueId,
    };
    broadcast({ type: 'follow', user });
  });

  // --- Viewer count ---
  tiktok.on('roomUser', (data) => {
    broadcast({ type: 'viewers', count: data.viewerCount });
  });

  tiktok.on('streamEnd', () => {
    console.log('📴 Stream ended');
    broadcast({ type: 'streamEnd' });
  });

  tiktok.on('error', (err) => {
    console.error('⚠️ Error:', err.message);
  });
}

// --- Demo Mode: simulate events for testing ---
function startDemoMode() {
  const demoNames = ['David', 'Sarah', 'Amit', 'Noa', 'Yossi', 'Maya', 'Omer', 'Shira', 'Eyal', 'Lior', 'Chen', 'Tal'];
  const demoGifts = ['Rose', 'Heart Me', 'Perfume', 'Drama Queen', 'Lion', 'Gold Mine', 'Love You', 'Finger Heart'];
  let idCounter = 1000;

  function randomUser() {
    const name = demoNames[Math.floor(Math.random() * demoNames.length)];
    return {
      id: String(idCounter++),
      name,
      uniqueId: name.toLowerCase(),
      avatar: null,
    };
  }

  // Auto-join teams
  setInterval(() => {
    const user = randomUser();
    const team = Math.random() > 0.5 ? 'red' : 'blue';
    broadcast({ type: 'joinTeam', user, team });
  }, 3000);

  // Auto-send gifts
  setInterval(() => {
    const user = randomUser();
    const giftName = demoGifts[Math.floor(Math.random() * demoGifts.length)];
    const giftAction = getGiftAction(giftName, 1);
    const repeatCount = Math.floor(Math.random() * 5) + 1;

    broadcast({
      type: 'gift',
      user,
      gift: {
        name: giftAction.name,
        icon: giftAction.icon,
        action: giftAction.action,
        power: giftAction.power * repeatCount,
        count: repeatCount,
        coins: (giftAction.coins || 1) * repeatCount,
      },
    });
  }, 2000);

  // Auto-likes
  setInterval(() => {
    const user = randomUser();
    broadcast({ type: 'like', user, count: Math.floor(Math.random() * 20) + 1 });
  }, 1500);

  broadcast({ type: 'connected', roomId: 'DEMO', viewers: 150 });
}

// --- Start Server ---
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🎮 TikTok LIVE Battle Arena Game      ║
║──────────────────────────────────────────║
║   Server: http://localhost:${PORT}          ║
║   Mode: ${DEMO_MODE ? 'DEMO (testing)' : `LIVE (@${TIKTOK_USERNAME})`}${' '.repeat(Math.max(0, 22 - (DEMO_MODE ? 15 : TIKTOK_USERNAME.length + 8)))}║
║──────────────────────────────────────────║
║   Usage:                                 ║
║   node server.js <tiktok_username>       ║
║   node server.js --demo                  ║
╚══════════════════════════════════════════╝
  `);
  connectToTikTok();
});
