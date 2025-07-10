require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const STASHIT_API = process.env.STASHIT_API;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text || '';

  // Handle /start or /help
  if (text.startsWith('/start') || text.startsWith('/help')) {
    bot.sendMessage(chatId, 'Welcome to StashIt Bot! Send me any text, link, or file and I will save it to your StashIt account.');
    return;
  }

  // Handle text messages
  if (text && !text.startsWith('/')) {
    await fetch(STASHIT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'note',
        content: text,
        telegram_user_id: userId
      })
    });
    bot.sendMessage(chatId, 'Saved to StashIt!');
    return;
  }

  // Handle photos
  if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
    await fetch(STASHIT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'image',
        file_url: fileUrl,
        telegram_user_id: userId
      })
    });
    bot.sendMessage(chatId, 'Photo saved to StashIt!');
    return;
  }

  // Handle documents
  if (msg.document) {
    const fileId = msg.document.file_id;
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
    await fetch(STASHIT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'document',
        file_url: fileUrl,
        file_name: msg.document.file_name,
        telegram_user_id: userId
      })
    });
    bot.sendMessage(chatId, 'Document saved to StashIt!');
    return;
  }

  // You can add more handlers for voice, video, etc.
});

bot.onText(/^\/link (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const code = match[1];

  // Call your API to link the Telegram user
  const res = await fetch(process.env.STASHIT_API.replace('/ingest/telegram', '/link-telegram'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, telegram_user_id: userId })
  });
  const data = await res.json();
  if (data.success) {
    bot.sendMessage(chatId, '✅ Your Telegram is now linked to your StashIt account!');
  } else {
    bot.sendMessage(chatId, `❌ Failed to link: ${data.error || 'Unknown error'}`);
  }
});