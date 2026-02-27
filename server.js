require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
const multer = require("multer");
const csv = require("csv-parser");
const stream = require("stream");

const Brand = require("./models/Brand");
const Model = require("./models/Model");
const Booking = require("./models/Booking");
const Admin = require("./models/Admin");
const Technician = require("./models/Technician");
const Service = require("./models/Service");

const { sendBookingEmail } = require("./services/bookingNotifications");

const app = express();
const PORT = process.env.PORT || 5000;

/* ================= DATABASE ================= */

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("❌ MongoDB Connection Error:", err.message);
  });

/* ================= MIDDLEWARE ================= */

app.use(cors({
  origin: ["http://localhost:3000", "https://bookmyrepair.netlify.app"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= ROOT ================= */

app.get("/", (req, res) => {
  res.send("Server is running");
});

/* ================= ADMIN ================= */

const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");

app.post("/api/admin/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt);

    const admin = await Admin.create({
      name,
      email,
      passwordHash: hash,
      passwordSalt: salt,
    });

    res.status(201).json(admin);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const hash = hashPassword(password, admin.passwordSalt);
    if (hash !== admin.passwordHash)
      return res.status(401).json({ error: "Invalid credentials" });

    res.json(admin);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/* ================= BRAND ================= */

app.post("/api/brands", async (req, res) => {
  const brand = await Brand.create(req.body);
  res.status(201).json(brand);
});

app.get("/api/brands", async (req, res) => {
  const brands = await Brand.find();
  res.json(brands);
});

/* ================= MODEL ================= */

app.post("/api/models", async (req, res) => {
  const model = await Model.create(req.body);
  res.status(201).json(model);
});

app.get("/api/models", async (req, res) => {
  const models = await Model.find().populate("brandId");
  res.json(models);
});

/* ================= TECHNICIAN ================= */

app.post("/api/technicians", async (req, res) => {
  const tech = await Technician.create(req.body);
  res.status(201).json(tech);
});

app.get("/api/technicians", async (req, res) => {
  const techs = await Technician.find();
  res.json(techs);
});

/* ================= BOOKING ================= */

// CREATE BOOKING
app.post("/api/bookings", async (req, res) => {
  try {
    const booking = await Booking.create(req.body);

    console.log("Booking created:", booking._id);
    console.log("Customer email:", booking.email);

    res.status(201).json(booking);

    // send email in background
    sendBookingEmail(booking);

  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

// GET ALL BOOKINGS
app.get("/api/bookings", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings);
});

// UPDATE BOOKING STATUS
app.put("/api/bookings/:id", async (req, res) => {
  try {
    const oldBooking = await Booking.findById(req.params.id);
    if (!oldBooking)
      return res.status(404).json({ error: "Booking not found" });

    const previousStatus = oldBooking.status;

    const updatedBooking = await Booking.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(updatedBooking);

    if (req.body.status && previousStatus !== req.body.status) {
      sendBookingEmail(updatedBooking, previousStatus);
    }

  } catch (error) {
    res.status(500).json({ error: "Update failed" });
  }
});

// TRACK BOOKING
app.post("/api/bookings/track", async (req, res) => {
  const { trackingId, phone } = req.body;

  const booking = await Booking.findOne({
    trackingId: trackingId?.trim().toUpperCase(),
    phone: phone?.trim()
  });

  if (!booking)
    return res.status(404).json({ error: "Booking not found" });

  res.json(booking);
});

/* ================= SERVICES ================= */

app.post("/api/services", async (req, res) => {
  const service = await Service.create(req.body);
  res.status(201).json(service);
});

app.get("/api/services", async (req, res) => {
  const services = await Service.find();
  res.json(services);
});
