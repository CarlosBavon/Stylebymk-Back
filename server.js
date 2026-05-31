require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const allowedOrigins = [
  "http://localhost:3000",
  "https://stylebymk.vercel.app",
];

const bookingRoutes = require("./routes/bookings");
const enquiryRoutes = require("./routes/enquiries");
const contactRoutes = require("./routes/contact");
const testimonialRoutes = require("./routes/testimonials");

const app = express();

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
  }),
);

app.use(express.json());

// Health check endpoint (useful for Render / uptime monitoring)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

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
app.use("/api/testimonials", testimonialRoutes);

// Catch‑all for undefined endpoints (must be after all valid routes)
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
