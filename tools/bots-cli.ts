// Tek başına denemek için: çalışan sunucuya N tane bot sokar (ev sahibi lobiden "Geceyi başlat" der).
//   npm run bots -- 7                      → yerel sunucuya 7 bot
//   npm run bots -- 3 wss://xxx.trycloudflare.com/ws

import { Bot } from './bot';

const n = Math.max(1, Math.min(11, Number(process.argv[2] ?? 7) || 7));
const url = process.argv[3] ?? 'ws://127.0.0.1:3000/ws';
const NAMES = ['Mehmet', 'Zeynep', 'Kerem', 'Selin', 'Burak', 'Defne', 'Can', 'Elif', 'Ozan', 'Deniz', 'Ece'];

async function main(): Promise<void> {
  const bots: Bot[] = [];
  for (let i = 0; i < n; i++) {
    try {
      const b = await Bot.connect(url, `${NAMES[i % NAMES.length]} (bot)`);
      b.autoplay();
      bots.push(b);
    } catch (e) {
      console.error(`Bot ${i + 1} bağlanamadı (${url}): ${(e as Error).message}\nSunucu çalışıyor mu? (npm start)`);
      process.exit(1);
    }
  }
  console.log(`${bots.length} bot lobide: ${url}\nEv sahibi tarayıcıdan "Geceyi Başlat"a bassın. Çıkmak için Ctrl+C.`);
  process.on('SIGINT', () => {
    for (const b of bots) b.close();
    process.exit(0);
  });
}

void main();
