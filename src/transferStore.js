import fs from 'fs';

const DB_FILE = new URL('../transfer_channels.json', import.meta.url).pathname;

// 形式: { [channelId]: { baseName: string, userLimit: number } }
let cache = {};

export function loadStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      cache = JSON.parse(raw || '{}');
    } else {
      cache = {};
      fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
    }
  } catch (e) {
    console.error('[store] failed to load store:', e);
    cache = {};
  }
}

export function saveStore() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('[store] failed to save store:', e);
  }
}

export function setTransfer(channelId, data) {
  cache[channelId] = data;
  saveStore();
}

export function removeTransfer(channelId) {
  delete cache[channelId];
  saveStore();
}

export function getTransfer(channelId) {
  return cache[channelId];
}

export function allTransfers() {
  return { ...cache };
}
