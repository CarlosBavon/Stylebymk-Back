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

const app = express();

// CORS middleware – this automatically handles OPTIONS preflight
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// API Routes
app.use("/api/bookings", bookingRoutes);
app.use("/api/enquiries", enquiryRoutes);
app.use("/api/contact", contactRoutes);

// Catch‑all for undefined routes – NO asterisk needed
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
