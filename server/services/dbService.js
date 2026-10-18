const fs = require('fs');
const path = require('path');
const config = require('../config');

// Ensure data folder exists
const dataDir = path.dirname(config.databaseFile);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = {
  users: {},
  orders: {},
  otps: {}
};

// Load existing data if file exists
function loadDb() {
  try {
    if (fs.existsSync(config.databaseFile)) {
      const raw = fs.readFileSync(config.databaseFile, 'utf8');
      db = JSON.parse(raw);
      if (!db.users) db.users = {};
      if (!db.orders) db.orders = {};
      if (!db.otps) db.otps = {};
    }
  } catch (err) {
    console.error('[DB] Failed to load database file, starting clean:', err.message);
  }
}

// Save data to disk atomically
function saveDb() {
  try {
    const tmpFile = `${config.databaseFile}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmpFile, config.databaseFile);
  } catch (err) {
    console.error('[DB] Failed to save database file:', err.message);
  }
}

loadDb();

module.exports = {
  getUser(userId) {
    return db.users[userId] || null;
  },

  findUserByPhone(phone) {
    return Object.values(db.users).find(u => u.phone === phone) || null;
  },

  createUser(userData) {
    const user = {
      id: userData.id,
      phone: userData.phone || null,
      hearts: typeof userData.hearts === 'number' ? userData.hearts : config.defaultGuestHearts,
      isVipUnlimited: Boolean(userData.isVipUnlimited),
      phoneBonusClaimed: Boolean(userData.phoneBonusClaimed),
      unlockedMedia: userData.unlockedMedia || {},
      metCharIds: userData.metCharIds || [],
      savedRooms: userData.savedRooms || {},
      matchFilter: userData.matchFilter || { ages: [], traits: [], regions: [] },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    db.users[user.id] = user;
    saveDb();
    return user;
  },

  updateUser(userId, updates) {
    if (!db.users[userId]) return null;
    db.users[userId] = {
      ...db.users[userId],
      ...updates,
      updatedAt: Date.now()
    };
    saveDb();
    return db.users[userId];
  },

  // OTP management
  setOtp(phone, code, ttlSeconds = 300) {
    db.otps[phone] = {
      code,
      expiresAt: Date.now() + ttlSeconds * 1000
    };
    saveDb();
  },

  getOtp(phone) {
    const entry = db.otps[phone];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      delete db.otps[phone];
      saveDb();
      return null;
    }
    return entry.code;
  },

  removeOtp(phone) {
    delete db.otps[phone];
    saveDb();
  },

  // Payment Orders
  createOrder(order) {
    db.orders[order.id] = {
      ...order,
      status: 'pending',
      createdAt: Date.now()
    };
    saveDb();
    return db.orders[order.id];
  },

  getOrder(orderId) {
    return db.orders[orderId] || null;
  },

  updateOrder(orderId, updates) {
    if (!db.orders[orderId]) return null;
    db.orders[orderId] = {
      ...db.orders[orderId],
      ...updates,
      updatedAt: Date.now()
    };
    saveDb();
    return db.orders[orderId];
  }
};
