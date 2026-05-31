const express = require("express");
const router = express.Router();
const Testimonial = require("../models/Testimonial");

// GET all testimonials (newest first)
router.get("/", async (req, res) => {
    try {
        const testimonials = await Testimonial.find().sort({ createdAt: -1 });
        res.json(testimonials);
    } catch (error) {
        console.error("Error fetching testimonials:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// POST a new testimonial
router.post("/", async (req, res) => {
    try {
        const { name, role, text, rating } = req.body;

        if (!name || !text) {
            return res.status(400).json({
                success: false,
                message: "Name and testimonial text are required",
            });
        }

        const testimonial = new Testimonial({
            name,
            role: role || "Loyal Client",
            text,
            rating: rating || 5,
        });

        await testimonial.save();
        res.status(201).json(testimonial);
    } catch (error) {
        console.error("Error saving testimonial:", error);
        res.status(500).json({ success: false, message: "Failed to save testimonial" });
    }
});

module.exports = router;