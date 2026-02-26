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

const app = express();
const PORT = process.env.PORT || 5000;

/* ================= MIDDLEWARE ================= */

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ================= DATABASE ================= */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log(err));

/* ================= ROOT ================= */

app.get("/", (req, res) => {
  res.send("Your server is on");
});

/* ================= UTIL FUNCTIONS ================= */

const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");

const generateToken = () => crypto.randomBytes(24).toString("hex");

/* ================= ADMIN AUTH ================= */

app.post("/api/admin/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: "All fields required" });

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

    res.status(201).json({ message: "Admin created", admin });
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
      admin,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/* ================= BRAND API ================= */

app.post("/api/brands", async (req, res) => {
  try {
    const { name, logo } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });

    const brand = await Brand.create({
      name: name.trim(),
      logo: logo || "",
    });

    res.status(201).json(brand);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/brands", async (req, res) => {
  const brands = await Brand.find().sort({ createdAt: -1 });
  res.json(brands);
});

app.put("/api/brands/:id", async (req, res) => {
  const brand = await Brand.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(brand);
});

app.delete("/api/brands/:id", async (req, res) => {
  await Model.deleteMany({ brandId: req.params.id });
  await Brand.findByIdAndDelete(req.params.id);
  res.json({ message: "Brand deleted" });
});

/* ================= MODEL API ================= */

app.post("/api/models", async (req, res) => {
  try {
    const { name, brandId } = req.body;

    if (!name || !brandId)
      return res.status(400).json({ error: "Name & brandId required" });

    const model = await Model.create({
      name: name.trim(),
      brandId,
      image: "",
    });

    res.status(201).json(model);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/models", async (req, res) => {
  const models = await Model.find().populate("brandId");
  res.json(models);
});

app.put("/api/models/:id", async (req, res) => {
  const model = await Model.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(model);
});

app.delete("/api/models/:id", async (req, res) => {
  await Model.findByIdAndDelete(req.params.id);
  res.json({ message: "Model deleted" });
});

/* ================= BULK CSV UPLOAD ================= */

const upload = multer({ storage: multer.memoryStorage() });

app.post("/api/models/bulk", upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "CSV file required" });

    const results = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

 bufferStream
  .pipe(csv({
    mapHeaders: ({ header }) =>
      header.replace(/^\uFEFF/, "").trim().toLowerCase()
  }))
  .on("data", (data) => results.push(data))
  .on("end", async () => {
        let brandsCreated = 0;
        let modelsCreated = 0;

        for (const row of results) {
          if (!row.brand || !row.model) continue;

          let brand = await Brand.findOne({
            name: { $regex: `^${row.brand.trim()}$`, $options: "i" },
          });

          if (!brand) {
            brand = await Brand.create({ name: row.brand.trim() });
            brandsCreated++;
          }

          const existingModel = await Model.findOne({
            name: row.model.trim(),
            brandId: brand._id,
          });

          if (!existingModel) {
            await Model.create({
              name: row.model.trim(),
              brandId: brand._id,
              image: "",
            });
            modelsCreated++;
          }
        }

        res.json({
          message: "Bulk upload completed",
          brandsCreated,
          modelsCreated,
        });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================= TECHNICIAN API ================= */

app.post("/api/technicians", async (req, res) => {
  const tech = await Technician.create(req.body);
  res.status(201).json(tech);
});

app.get("/api/technicians", async (req, res) => {
  const techs = await Technician.find();
  res.json(techs);
});

app.put("/api/technicians/:id", async (req, res) => {
  const tech = await Technician.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(tech);
});

app.delete("/api/technicians/:id", async (req, res) => {
  await Technician.findByIdAndDelete(req.params.id);
  res.json({ message: "Technician deleted" });
});

/* ================= BOOKING API ================= */

app.post("/api/bookings", async (req, res) => {
  try {
    const booking = await Booking.create(req.body);
    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/bookings", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings);
});

app.get("/api/bookings/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  res.json(booking);
});

app.put("/api/bookings/:id", async (req, res) => {
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(booking);
});

app.delete("/api/bookings/:id", async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);
  res.json({ message: "Booking deleted" });
});
app.post("/api/bookings/track", async (req, res) => {
  try {
    const { bookingId, phone } = req.body;

    const booking = await Booking.findOne({
      _id: bookingId,
      phone: phone,
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
/* ================= START SERVER ================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
