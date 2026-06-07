const express = require('express');
const router = express.Router();
const Rating = require('../models/Rating');
const { ratingLimiter } = require('../middleware/rateLimiter');

// Submit a rating (POST)
router.post('/', async (req, res) => {
    try {
        const { email, stars, comment } = req.body;
        if (!email || !stars || stars < 1 || stars > 5) {
            return res.status(400).json({ success: false, message: 'Invalid data' });
        }
        // Upsert: update if exists, else create
        const rating = await Rating.findOneAndUpdate(
            { email },
            { stars, comment, createdAt: new Date() },
            { upsert: true, new: true }
        );
        res.json({ success: true, message: 'Thank you for your rating!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/', ratingLimiter, async (req, res) => {
    try {
        const { stars, comment } = req.body;
        if (!stars || stars < 1 || stars > 5) {
            return res.status(400).json({ success: false, message: 'Invalid stars (1-5)' });
        }
        const rating = new Rating({ stars, comment });
        await rating.save();
        res.json({ success: true, message: 'Thank you for your rating!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get average rating (GET)
router.get('/average', async (req, res) => {
    try {
        const result = await Rating.aggregate([
            { $group: { _id: null, average: { $avg: '$stars' }, count: { $sum: 1 } } }
        ]);
        const avg = result.length > 0 ? result[0].average : 0;
        const count = result.length > 0 ? result[0].count : 0;
        res.json({ success: true, average: parseFloat(avg.toFixed(1)), count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;