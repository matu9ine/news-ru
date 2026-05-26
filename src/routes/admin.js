const express = require('express');
const path = require('path');

const router = express.Router();

const ADMIN_INDEX = path.join(__dirname, '..', '..', 'admin', 'index.html');

// Все маршруты /admin/* отдают SPA-оболочку
router.get('*', (req, res) => {
  res.sendFile(ADMIN_INDEX);
});

module.exports = router;
