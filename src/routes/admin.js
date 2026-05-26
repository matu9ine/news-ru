const express = require('express');
const path = require('path');

const router = express.Router();

const ADMIN_INDEX = path.join(__dirname, '..', '..', 'admin', 'index.html');

// Все маршруты /admin/* отдают SPA-оболочку (кроме статики)
router.get('*', (req, res, next) => {
  // Пропускаем запросы к статическим файлам
  if (req.path.startsWith('/static')) return next();
  res.sendFile(ADMIN_INDEX);
});

module.exports = router;
