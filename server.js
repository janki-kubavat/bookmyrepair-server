require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

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

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT}`)
    );
  })
  .catch((err) => console.log("MongoDB error:", err));

/* ================= MIDDLEWARE ================= */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= ROOT ================= */

app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

/* ================= PASSWORD UTILS ================= */

const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");

const generateToken = () => crypto.randomBytes(24).toString("hex");

/* ================= IMAGE UPLOAD ================= */

const uploadPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

app.use("/uploads", express.static(uploadPath));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"), false);
  }
});

/* ================= ADMIN ================= */

app.post("/api/admin/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exist = await Admin.findOne({ email });
    if (exist) return res.status(400).json({ error: "Email exists" });

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password, salt);

    const admin = await Admin.create({
      name,
      email,
      passwordHash: hash,
      passwordSalt: salt
    });

    res.json(admin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ error: "Invalid login" });

    const hash = hashPassword(password, admin.passwordSalt);
    if (hash !== admin.passwordHash)
      return res.status(401).json({ error: "Invalid login" });

    res.json({
      message: "Login success",
      token: generateToken(),
      admin
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= BRANDS ================= */

app.post("/api/brands", async (req, res) => {
  const brand = await Brand.create(req.body);
  res.json(brand);
});

app.get("/api/brands", async (req, res) => {
  const brands = await Brand.find().sort({ createdAt: -1 });
  res.json(brands);
});

app.delete("/api/brands/:id", async (req, res) => {
  await Model.deleteMany({ brandId: req.params.id });
  await Brand.findByIdAndDelete(req.params.id);
  res.json({ message: "Brand deleted" });
});

/* ================= MODELS ================= */

app.post("/api/models", async (req, res) => {
  const model = await Model.create(req.body);
  res.json(model);
});

app.get("/api/models", async (req, res) => {
  const models = await Model.find().populate("brandId");
  res.json(models);
});

/* ================= TECHNICIANS ================= */

app.post("/api/technicians", async (req, res) => {
  const tech = await Technician.create(req.body);
  res.json({ message: "Technician added", technician: tech });
});

app.get("/api/technicians", async (req, res) => {
  const techs = await Technician.find().sort({ createdAt: -1 });
  res.json(techs);
});

/* ================= BOOKINGS ================= */

app.post("/api/bookings", async (req, res) => {
  try {
    const booking = await Booking.create(req.body);

    if (booking.email) {
      await sendBookingEmail(booking);
    }

    res.json({
      trackingId: booking.trackingId,
      phone: booking.phone
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/bookings", async (req, res) => {
  const bookings = await Booking.find()
    .sort({ createdAt: -1 })
    .populate("technicianId");

  res.json(bookings);
});

/* ================= SERVICES ================= */

app.post("/api/services", upload.single("image"), async (req, res) => {
  try {
    const { name, subtitle } = req.body;

    const service = await Service.create({
      name,
      subtitle: subtitle || "",
      image: req.file ? `/uploads/${req.file.filename}` : ""
    });

    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/services", async (req, res) => {
  const services = await Service.find().sort({ createdAt: -1 });
  res.json(services);
});

app.delete("/api/services/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (service?.image) {
      const filePath = path.join(
        __dirname,
        "uploads",
        path.basename(service.image)
      );

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await Service.findByIdAndDelete(req.params.id);

    res.json({ message: "Service deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
