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
// const { sendBookingEmail } = require("./services/bookingNotifications");
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

const allowedOrigins = [
  "http://localhost:3000",
  "https://bookmyrepair.netlify.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ================= ROOT ================= */

app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

/* ================= UTIL FUNCTIONS ================= */

const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");

const generateToken = () =>
  crypto.randomBytes(24).toString("hex");

/* ================= ADMIN API ================= */

app.post("/api/admin/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await Admin.findOne({ email });
    if (existing)
      return res.status(409).json({ error: "Email already exists" });

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
    if (!admin)
      return res.status(401).json({ error: "Invalid credentials" });

    const hash = hashPassword(password, admin.passwordSalt);
    if (hash !== admin.passwordHash)
      return res.status(401).json({ error: "Invalid credentials" });

    res.json({
      message: "Login success",
      token: generateToken(),
      admin
    });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/* ================= BRAND API ================= */

app.post("/api/brands", async (req, res) => {
  const brand = await Brand.create(req.body);
  res.status(201).json(brand);
});

app.get("/api/brands", async (req, res) => {
  const brands = await Brand.find().sort({ createdAt: -1 });
  res.json(brands);
});

app.put("/api/brands/:id", async (req, res) => {
  const brand = await Brand.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(brand);
});

app.delete("/api/brands/:id", async (req, res) => {
  await Model.deleteMany({ brandId: req.params.id });
  await Brand.findByIdAndDelete(req.params.id);
  res.json({ message: "Brand deleted" });
});

/* ================= MODEL API ================= */

app.post("/api/models", async (req, res) => {
  const model = await Model.create(req.body);
  res.status(201).json(model);
});

app.get("/api/models", async (req, res) => {
  const models = await Model.find().populate("brandId");
  res.json(models);
});

app.put("/api/models/:id", async (req, res) => {
  const model = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(model);
});

app.delete("/api/models/:id", async (req, res) => {
  await Model.findByIdAndDelete(req.params.id);
  res.json({ message: "Model deleted" });
});



/* ================= TECHNICIAN API ================= */

// Add Technician
app.post("/api/technicians", async (req, res) => {
  try {
    const { name, phone } = req.body;

    const tech = await Technician.create({
      name,
      phone
    });

    res.status(201).json({
      message: "Technician added successfully",
      technician: tech
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get All Technicians
app.get("/api/technicians", async (req, res) => {
  try {

    const techs = await Technician.find().sort({ createdAt: -1 });

    res.json(techs);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Single Technician
app.get("/api/technicians/:id", async (req, res) => {
  try {

    const tech = await Technician.findById(req.params.id);

    if (!tech) {
      return res.status(404).json({ error: "Technician not found" });
    }

    res.json(tech);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Technician
app.put("/api/technicians/:id", async (req, res) => {
  try {

    const tech = await Technician.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({
      message: "Technician updated successfully",
      technician: tech
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Technician
app.delete("/api/technicians/:id", async (req, res) => {
  try {

    await Technician.findByIdAndDelete(req.params.id);

    res.json({
      message: "Technician deleted successfully"
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================= BOOKING API ================= */

app.post("/api/bookings", async (req, res) => {
  try {
    const booking = await Booking.create(req.body);

    res.status(201).json({
      trackingId: booking.trackingId,
      phone: booking.phone,
    });

  } catch (error) {
    console.error("BOOKING ERROR:", error);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

app.get("/api/bookings/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  res.json(booking);
});

app.put("/api/bookings/:id", async (req, res) => {
  const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(booking);
});

app.delete("/api/bookings/:id", async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);
  res.json({ message: "Booking deleted" });
});
app.post("/api/bookings/track", async (req, res) => {
  try {
    const { trackingId, phone } = req.body;

    // ✅ Check missing values
    if (!trackingId || !phone) {
      return res.status(400).json({ error: "Tracking ID and phone are required" });
    }

    const cleanTrackingId = trackingId.toString().trim().toUpperCase();
    const cleanPhone = phone.toString().trim();

    const booking = await Booking.findOne({
      trackingId: cleanTrackingId,
      phone: cleanPhone,
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json(booking);

  } catch (error) {
    console.error("TRACK API ERROR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
/* ================= SERVICE API ================= */
/* ================= SERVICE API ================= */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

app.use("/uploads", express.static("uploads"));


/* ADD SERVICE */

app.post("/api/services", upload.single("image"), async (req, res) => {

  try {

    const { name, subtitle } = req.body;

    const service = await Service.create({
      image: req.file ? `/uploads/${req.file.filename}` : "",
      name,
      subtitle
    });

    res.status(201).json(service);

  } catch (error) {

    res.status(500).json({ error: error.message });

  }

});


/* GET SERVICES */

app.get("/api/services", async (req, res) => {

  const services = await Service.find().sort({ createdAt: -1 });

  res.json(services);

});


/* UPDATE SERVICE */

app.put("/api/services/:id", upload.single("image"), async (req, res) => {

  const { name, subtitle } = req.body;

  const updateData = {
    name,
    subtitle
  };

  if (req.file) {
    updateData.image = `/uploads/${req.file.filename}`;
  }

  const service = await Service.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  );

  res.json(service);

});


/* DELETE SERVICE */

app.delete("/api/services/:id", async (req, res) => {

  await Service.findByIdAndDelete(req.params.id);

  res.json({ message: "Service deleted" });

});
