const express = require('express');
const router = express.Router();
const Rating = require('../models/Rating');
const { ratingLimiter } = require('../middleware/rateLimiter');

// Submit a rating (POST) – with rate limiter, no email required
router.post('/', ratingLimiter, async (req, res) => {
    console.log('Received rating data:', req.body);
    try {
        const { stars, comment } = req.body;
        // Validate stars (comment is optional)
        if (typeof stars !== 'number' || stars < 1 || stars > 5) {
            return res.status(400).json({ success: false, message: 'Stars must be a number between 1 and 5' });
        }
        const rating = new Rating({ stars, comment: comment || '' });
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
