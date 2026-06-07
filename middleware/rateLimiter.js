const rateLimit = require('express-rate-limit');

// General limiter – applies to all routes (default)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                 // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again after 15 minutes.'
    },
    standardHeaders: true,    // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,     // Disable the `X-RateLimit-*` headers
});

const ratingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 1,
    message: {
        success: false,
        message: 'You have already submitted a rating recently. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limiter for booking creation (POST /api/bookings)
const bookingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Too many booking attempts. Please wait an hour before trying again.'
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limiter for enquiries and contact forms
const enquiryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,                  // max 10 messages per hour per IP
    message: {
        success: false,
        message: 'Too many messages sent from this IP. Please wait before sending more.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Optional: even stricter for cancellation attempts (to avoid mass cancellation)
const cancelLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: {
        success: false,
        message: 'Too many cancellation attempts. Please try again after 15 minutes.'
    }
});

module.exports = {
    generalLimiter,
    bookingLimiter,
    enquiryLimiter,
    cancelLimiter,
    ratingLimiter,
};