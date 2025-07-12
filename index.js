require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const STASHIT_API = process.env.STASHIT_API;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function downloadTelegramFile(fileUrl) {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error('Failed to download file from Telegram');
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToSupabaseStorage(buffer, fileName, contentType) {
  const filePath = `${Date.now()}_${fileName}`;
  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(filePath, buffer, { contentType, upsert: false });
  if (error) throw error;
  // Get public URL
  const { data: publicUrlData } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath);
  return publicUrlData.publicUrl;
}

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
    try {
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;
      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
      const buffer = await downloadTelegramFile(fileUrl);
      const fileName = `${fileId}.jpg`;
      const supabaseUrl = await uploadToSupabaseStorage(buffer, fileName, 'image/jpeg');
      await fetch(STASHIT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          file_url: supabaseUrl,
          telegram_user_id: userId
        })
      });
      bot.sendMessage(chatId, 'Photo saved to StashIt!');
    } catch (err) {
      bot.sendMessage(chatId, `Failed to save photo: ${err.message}`);
    }
    return;
  }

  // Handle documents
  if (msg.document) {
    try {
      const fileId = msg.document.file_id;
      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
      const buffer = await downloadTelegramFile(fileUrl);
      const fileName = msg.document.file_name || `${fileId}`;
      const contentType = msg.document.mime_type || 'application/octet-stream';
      const supabaseUrl = await uploadToSupabaseStorage(buffer, fileName, contentType);
      await fetch(STASHIT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'document',
          file_url: supabaseUrl,
          file_name: fileName,
          telegram_user_id: userId
        })
      });
      bot.sendMessage(chatId, 'Document saved to StashIt!');
    } catch (err) {
      bot.sendMessage(chatId, `Failed to save document: ${err.message}`);
    }
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