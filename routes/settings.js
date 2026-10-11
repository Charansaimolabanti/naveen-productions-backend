const express = require('express');
const Setting = require('../models/Setting');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings - public: single settings document (upsert default if none exists)
router.get('/', async (req, res) => {
  try {
    const settings = await Setting.findOneAndUpdate(
      {},
      {},
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/settings - admin: upsert settings (merge into existing doc)
router.put('/', protect, async (req, res) => {
  try {
    const settings = await Setting.findOneAndUpdate(
      {},
      { $set: req.body },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;