require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require('helmet');
const morgan = require('morgan');
const {
  generalLimiter,
  bookingLimiter,
  enquiryLimiter,
} = require('./middleware/rateLimiter');

const allowedOrigins = [
  "http://localhost:3000",
  "https://stylebymk.vercel.app",
];

const bookingRoutes = require("./routes/bookings");
const enquiryRoutes = require("./routes/enquiries");
const contactRoutes = require("./routes/contact");

const app = express();

// Trust proxy – required when behind a load balancer (e.g., Render)
app.set('trust proxy', 1);

// CORS middleware (handles preflight automatically)
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      const msg = "CORS policy does not allow access from this origin.";
      return callback(new Error(msg), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(helmet());
app.use(morgan('combined'));

app.set('trust proxy', 1);

// Health check endpoint (unlimited, no rate limiting)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", generalLimiter);
app.use("/api/bookings", bookingLimiter);
app.use("/api/enquiries", enquiryLimiter);
app.use("/api/contact", enquiryLimiter);

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// API Routes (bookings includes calendar functionality)
app.use("/api/bookings", bookingRoutes);
app.use("/api/enquiries", enquiryRoutes);
app.use("/api/contact", contactRoutes);

// Catch‑all for undefined endpoints (must be after all valid routes)
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
