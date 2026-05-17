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

// Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (e.g., curl, mobile apps)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
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

// Handle preflight requests explicitly
app.options("*", cors());

app.use(express.json());

// Health check endpoint (for Render / uptime monitoring)
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

// API Routes
app.use("/api/bookings", bookingRoutes); // includes all booking + M-Pesa endpoints
app.use("/api/enquiries", enquiryRoutes);
app.use("/api/contact", contactRoutes);

// Fallback for undefined routes
app.use("*", (req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
