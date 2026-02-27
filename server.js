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
const router = express.Router();

const app = express();
const PORT = process.env.PORT || 5000;




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
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
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

/* ================= BOOKING API ================= */

// 1️⃣ Create booking
app.post("/api/bookings", async (req, res) => {
  try {
    const booking = await Booking.create(req.body);
    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 2️⃣ Get all bookings
app.get("/api/bookings", async (req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings);
});

// 3️⃣ 🔥 TRACK ROUTE MUST BE HERE
app.post("/api/bookings/track", async (req, res) => {
  try {
    const { trackingId, phone } = req.body;

    if (!trackingId || !phone) {
      return res.status(400).json({ error: "Tracking ID and phone required." });
    }

    const booking = await Booking.findOne({
      trackingId: trackingId.trim().toUpperCase(),
      phone: phone.trim(),
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

// 4️⃣ AFTER track
app.get("/api/bookings/:id", async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  res.json(booking);
});

// 5️⃣ Update
app.put("/api/bookings/:id", async (req, res) => {
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(booking);
});

// 6️⃣ Delete
app.delete("/api/bookings/:id", async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);
  res.json({ message: "Booking deleted" });
});
/* ================= START SERVER ================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

/* ======================================================
   🔥 SERVICES APIs (FULL PROFESSIONAL VERSION)
====================================================== */

/* 1️⃣ CREATE SERVICE */
app.post("/api/services", async (req, res) => {
  try {
    const { name, description, price, image, isActive } = req.body;

    if (!name || !price) {
      return res.status(400).json({
        success: false,
        message: "Name and Price are required",
      });
    }

    const existing = await Service.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Service already exists",
      });
    }

    const service = await Service.create({
      name: name.trim(),
      description,
      price,
      image,
      isActive: isActive ?? true,
    });

    res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: service,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});


/* 2️⃣ GET ALL SERVICES (Search + Filter + Pagination) */
app.get("/api/services", async (req, res) => {
  try {
    const { search, active, page = 1, limit = 10 } = req.query;

    let filter = {};

    if (active !== undefined) {
      filter.isActive = active === "true";
    }

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const skip = (page - 1) * limit;

    const services = await Service.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Service.countDocuments(filter);

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: services,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});


/* 3️⃣ GET SINGLE SERVICE */
app.get("/api/services/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    res.status(200).json({
      success: true,
      data: service,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid service ID",
    });
  }
});


/* 4️⃣ UPDATE SERVICE */
app.put("/api/services/:id", async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: service,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});


/* 5️⃣ DELETE SERVICE */
app.delete("/api/services/:id", async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid service ID",
    });
  }
});


/* 6️⃣ TOGGLE ACTIVE / INACTIVE */
app.patch("/api/services/:id/status", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    service.isActive = !service.isActive;
    await service.save();

    res.status(200).json({
      success: true,
      message: "Service status updated",
      data: service,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid service ID",
    });
  }
});

