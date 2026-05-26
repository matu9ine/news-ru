const { getAllSettings } = require('./settings');

async function postToVK(news, url, settings) {
  const token = (settings.vk_access_token || '').trim();
  const groupId = (settings.vk_group_id || '').trim();
  if (!token || !groupId) {
    return { ok: false, skipped: true, reason: 'vk not configured' };
  }
  try {
    const params = new URLSearchParams({
      owner_id: `-${groupId.replace(/^-/, '')}`,
      from_group: '1',
      message: `${news.title}\n\n${url}`,
      attachments: url,
      access_token: token,
      v: '5.199',
    });
    const res = await fetch(
      `https://api.vk.com/method/wall.post?${params.toString()}`,
      { method: 'GET' }
    );
    const data = await res.json();
    if (data.error) {
      return { ok: false, error: data.error.error_msg || 'VK error' };
    }
    return { ok: true, id: data.response?.post_id };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function postToTelegram(news, url, settings) {
  const token = (settings.tg_bot_token || '').trim();
  const chatId = (settings.tg_chat_id || '').trim();
  if (!token || !chatId) {
    return { ok: false, skipped: true, reason: 'tg not configured' };
  }
  try {
    const safeTitle = String(news.title || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `<b>${safeTitle}</b>\n\n${url}`,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      }
    );
    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.description || 'TG error' };
    }
    return { ok: true, id: data.result?.message_id };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function autopost(news, siteUrl) {
  const settings = getAllSettings();
  if (settings.autopost_enabled !== '1') {
    return {
      vk: { ok: false, skipped: true, reason: 'autopost disabled' },
      tg: { ok: false, skipped: true, reason: 'autopost disabled' },
    };
  }
  const url = `${String(siteUrl || '').replace(/\/+$/, '')}/news/${news.slug}`;
  const [vk, tg] = await Promise.all([
    postToVK(news, url, settings),
    postToTelegram(news, url, settings),
  ]);
  return { vk, tg };
}

module.exports = { autopost, postToVK, postToTelegram };
