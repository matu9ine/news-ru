require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { init, db } = require('../src/db');
const { UPLOADS_DIR } = require('../src/paths');

const IMAGE_RE = /\.(jpe?g|png|gif|tiff?|bmp)$/i;

function toWebpName(filename) {
  return filename.replace(/\.[^.]+$/, '.webp');
}

async function convertFile(filename) {
  if (!IMAGE_RE.test(filename)) return null;
  const src = path.join(UPLOADS_DIR, filename);
  const webpName = toWebpName(filename);
  const dst = path.join(UPLOADS_DIR, webpName);
  if (fs.existsSync(dst)) return { from: `/uploads/${filename}`, to: `/uploads/${webpName}`, skipped: true };

  await sharp(src)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(dst);

  return { from: `/uploads/${filename}`, to: `/uploads/${webpName}`, skipped: false };
}

function replaceAll(value, replacements) {
  if (!value) return value;
  let next = String(value);
  for (const r of replacements) {
    next = next.split(r.from).join(r.to);
  }
  return next;
}

function updateDatabase(replacements) {
  if (!replacements.length) return;
  const news = db.prepare('SELECT id, cover_image, author_photo, content FROM news').all();
  const updateNews = db.prepare(
    'UPDATE news SET cover_image = ?, author_photo = ?, content = ?, updated_at = updated_at WHERE id = ?'
  );
  const settings = db.prepare("SELECT key, value FROM settings WHERE key = 'logo_image'").all();
  const updateSetting = db.prepare('UPDATE settings SET value = ? WHERE key = ?');

  const tx = db.transaction(() => {
    for (const row of news) {
      const cover = replaceAll(row.cover_image, replacements);
      const authorPhoto = replaceAll(row.author_photo, replacements);
      const content = replaceAll(row.content, replacements);
      if (cover !== row.cover_image || authorPhoto !== row.author_photo || content !== row.content) {
        updateNews.run(cover, authorPhoto, content, row.id);
      }
    }
    for (const row of settings) {
      const value = replaceAll(row.value, replacements);
      if (value !== row.value) updateSetting.run(value, row.key);
    }
  });
  tx();
}

async function main() {
  init();
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log(`Uploads directory not found: ${UPLOADS_DIR}`);
    return;
  }

  const files = fs.readdirSync(UPLOADS_DIR).filter((name) => IMAGE_RE.test(name));
  const replacements = [];
  for (const file of files) {
    const converted = await convertFile(file);
    if (converted) {
      replacements.push(converted);
      console.log(`${converted.skipped ? 'exists' : 'converted'}: ${converted.from} -> ${converted.to}`);
    }
  }

  updateDatabase(replacements);
  console.log(`Done. Processed ${replacements.length} image reference(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
