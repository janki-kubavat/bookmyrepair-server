require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
const Brand = require("./models/Brand");
const Model = require("./models/Model");
const Booking = require("./models/Booking");
const Admin = require("./models/Admin");
const Technician = require("./models/Technician");
const { sendBookingNotifications, sendBookingStatusNotifications } = require("./services/bookingNotifications");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const hashPassword = (password, salt) =>
  crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");

const generateToken = () => crypto.randomBytes(24).toString("hex");
const cleanString = (value) => (typeof value === "string" ? value.trim() : "");
const cleanPhone = (value) => String(value || "").trim();
const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const buildGoogleMapUrl = (lat, lng) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `https://www.google.com/maps?q=${lat},${lng}`;
};
const buildAddressMapUrl = (address) => {
  const value = cleanString(address);
  if (!value) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
};

const STATUS_VALUES = [
  "Pending",
  "Assigned",
  "Pickup Started",
  "In Service",
  "In Progress",
  "Completed",
  "Cancelled",
];

const DEFAULT_BRANDS = ["Apple", "Samsung", "OnePlus", "Xiaomi", "Vivo", "Oppo", "Realme", "Motorola"];
const DEFAULT_MODELS_BY_BRAND = {
  Apple: ["iPhone 11", "iPhone 12", "iPhone 13", "iPhone 14"],
  Samsung: ["Galaxy S21", "Galaxy S22", "Galaxy A52", "Galaxy M33"],
  OnePlus: ["OnePlus 9", "OnePlus 10 Pro", "OnePlus Nord CE", "OnePlus 11R"],
  Xiaomi: ["Redmi Note 11", "Redmi Note 12", "Mi 11X", "Xiaomi 12 Pro"],
  Vivo: ["Vivo V23", "Vivo V25", "Vivo Y56"],
  Oppo: ["Oppo Reno 8", "Oppo F21 Pro", "Oppo A78"],
  Realme: ["Realme 9 Pro", "Realme 10", "Realme Narzo 50"],
  Motorola: ["Moto G52", "Moto G73", "Moto Edge 30"],
};

const seedDefaultCatalog = async () => {
  const brandCount = await Brand.countDocuments();
  if (brandCount > 0) return;

  const createdBrands = await Brand.insertMany(DEFAULT_BRANDS.map((name) => ({ name })));
  const brandIdByName = new Map(createdBrands.map((brand) => [brand.name, brand._id]));

  const modelDocs = [];
  Object.entries(DEFAULT_MODELS_BY_BRAND).forEach(([brandName, modelNames]) => {
    const brandId = brandIdByName.get(brandName);
    if (!brandId) return;

    modelNames.forEach((modelName) => {
      modelDocs.push({ name: modelName, brandId, image: "" });
    });
  });

  if (modelDocs.length > 0) {
    await Model.insertMany(modelDocs);
  }

  console.log("Default catalog seeded: brands and models created.");
};

// Return clear error when request JSON is malformed.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  next();
});

// MongoDB Connect
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB Connected");
    await seedDefaultCatalog();
  })
  .catch((err) => console.log(err));

// ================= BRAND API =================

// ================= ADMIN AUTH API =================

app.post("/api/admin/register", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "password must be at least 6 characters" });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "Admin email already exists" });
    }

    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, passwordSalt);

    const admin = await Admin.create({ name, email, passwordHash, passwordSalt });
    res.status(201).json({
      message: "Admin registered successfully",
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const attemptedHash = hashPassword(password, admin.passwordSalt);
    if (attemptedHash !== admin.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.json({
      message: "Login successful",
      token: generateToken(),
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Add Brand
app.post("/api/brands", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const logo = typeof req.body?.logo === "string" ? req.body.logo.trim() : "";

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const brand = await Brand.create({ name, logo });
    res.status(201).json(brand);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get Brands
app.get("/api/brands", async (req, res) => {
  try {
    const brands = await Brand.find();
    res.json(brands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= MODEL API =================

// Add Model
app.post("/api/models", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const brandId = req.body?.brandId;
    const image = typeof req.body?.image === "string" ? req.body.image.trim() : "";

    if (!name || !brandId) {
      return res.status(400).json({ error: "name and brandId are required" });
    }

    const model = await Model.create({ name, brandId, image });
    res.status(201).json(model);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get Models
app.get("/api/models", async (req, res) => {
  try {
    const models = await Model.find().populate("brandId");
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= TECHNICIAN API =================

// Add Technician
app.post("/api/technicians", async (req, res) => {
  try {
    const payload = {
      name: cleanString(req.body?.name),
      phone: cleanPhone(req.body?.phone),
      email: cleanString(req.body?.email).toLowerCase(),
      isActive: req.body?.isActive !== false,
    };

    if (!payload.name || !payload.phone) {
      return res.status(400).json({ error: "name and phone are required" });
    }

    const technician = await Technician.create(payload);
    res.status(201).json(technician);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get Technicians
app.get("/api/technicians", async (req, res) => {
  try {
    const onlyActive = String(req.query?.active || "true").toLowerCase() !== "false";
    const query = onlyActive ? { isActive: true } : {};
    const technicians = await Technician.find(query).sort({ name: 1 });
    res.json(technicians);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Technician
app.put("/api/technicians/:id", async (req, res) => {
  try {
    const updates = {};

    if (typeof req.body?.name === "string") updates.name = cleanString(req.body.name);
    if (typeof req.body?.phone === "string") updates.phone = cleanPhone(req.body.phone);
    if (typeof req.body?.email === "string") updates.email = cleanString(req.body.email).toLowerCase();
    if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;

    const technician = await Technician.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }

    res.json(technician);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete Technician
app.delete("/api/technicians/:id", async (req, res) => {
  try {
    const technician = await Technician.findByIdAndDelete(req.params.id);
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }

    await Booking.updateMany(
      { technicianId: technician._id },
      {
        technicianId: null,
        technicianName: "",
        technicianPhone: "",
        technician: "",
      }
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ================= BOOKING API =================

// Add Booking
app.post("/api/bookings", async (req, res) => {
  try {
    const selectedIssues = Array.isArray(req.body?.selectedIssues)
      ? req.body.selectedIssues.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const pickupOption = cleanString(req.body?.pickupOption) || "Pickup & Drop";
    const resolvedAddress = cleanString(req.body?.address) || cleanString(req.body?.location);
    const pickupAddress =
      cleanString(req.body?.pickupAddress) || (pickupOption === "Pickup & Drop" ? resolvedAddress : "");
    const pickupPhone =
      cleanPhone(req.body?.pickupPhone) || (pickupOption === "Pickup & Drop" ? cleanPhone(req.body?.phone) : "");

    const payload = {
      brand: cleanString(req.body?.brand),
      model: cleanString(req.body?.model),
      service: cleanString(req.body?.service),
      name: cleanString(req.body?.name),
      phone: cleanString(req.body?.phone),
      email: cleanString(req.body?.email).toLowerCase(),
      pickupOption,
      address: resolvedAddress,
      pickupAddress,
      pickupPhone,
      pickupMapUrl: buildAddressMapUrl(pickupAddress),
      location: cleanString(req.body?.location) || resolvedAddress,
      selectedIssues,
      issueOne: cleanString(req.body?.issueOne),
      issueTwo: cleanString(req.body?.issueTwo),
      status: cleanString(req.body?.status) || "Pending",
      technician: cleanString(req.body?.technician) || cleanString(req.body?.technicianName),
      technicianName: cleanString(req.body?.technicianName) || cleanString(req.body?.technician),
      technicianPhone: cleanPhone(req.body?.technicianPhone),
      adminNote: cleanString(req.body?.adminNote),
      mapUrl: cleanString(req.body?.mapUrl),
    };

    const lat = toNumberOrNull(req.body?.liveLocation?.lat ?? req.body?.lat);
    const lng = toNumberOrNull(req.body?.liveLocation?.lng ?? req.body?.lng);

    if (lat !== null && lng !== null) {
      payload.liveLocation = { lat, lng, updatedAt: new Date() };
      payload.mapUrl = payload.mapUrl || buildGoogleMapUrl(lat, lng);
    }

    if (
      !payload.brand ||
      !payload.model ||
      !payload.service ||
      !payload.name ||
      !payload.phone ||
      !payload.email ||
      !payload.address
    ) {
      return res
        .status(400)
        .json({ error: "brand, model, service, name, phone, email and address are required" });
    }

    const bookingDoc = await Booking.create(payload);
    const booking = bookingDoc.toObject();

    let notification = {
      email: { configured: false, customerSent: false, adminSent: false, errors: [] },
      whatsapp: { configured: false, customerSent: false, adminSent: false, errors: [] },
    };

    try {
      notification = await sendBookingNotifications(booking);
    } catch (notificationError) {
      notification.email.errors.push(`Notification service error: ${notificationError.message}`);
    }

    res.status(201).json({ ...booking, notification });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get All Bookings (latest first)
app.get("/api/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track Booking by Tracking ID and Phone
app.post("/api/bookings/track", async (req, res) => {
  try {
    const trackingIdRaw = cleanString(req.body?.trackingId);
    const phone = cleanString(req.body?.phone);

    if (!trackingIdRaw || !phone) {
      return res.status(400).json({ error: "trackingId and phone are required" });
    }

    const trackingId = trackingIdRaw.toUpperCase();
    const filters = [{ trackingId }];

    if (mongoose.Types.ObjectId.isValid(trackingIdRaw)) {
      filters.push({ _id: trackingIdRaw });
    }

    const booking = await Booking.findOne({
      phone,
      $or: filters,
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found for this tracking ID and phone" });
    }

    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get Booking By ID
app.get("/api/bookings/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Assign Technician
app.put("/api/bookings/:id/assign-technician", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const previousStatus = booking.status || "Pending";
    const technicianIdRaw = cleanString(req.body?.technicianId);
    const manualTechnicianName = cleanString(req.body?.technicianName || req.body?.technician);
    const manualTechnicianPhone = cleanPhone(req.body?.technicianPhone);
    const requestedStatus = cleanString(req.body?.status);

    let technicianId = null;
    let technicianName = manualTechnicianName;
    let technicianPhone = manualTechnicianPhone;

    if (technicianIdRaw) {
      const technicianDoc = await Technician.findById(technicianIdRaw);
      if (!technicianDoc) {
        return res.status(404).json({ error: "Technician not found" });
      }

      technicianId = technicianDoc._id;
      technicianName = technicianDoc.name;
      technicianPhone = technicianDoc.phone;
    }

    if (!technicianName) {
      return res.status(400).json({ error: "technicianId or technicianName is required" });
    }

    const nextStatus = requestedStatus || "Assigned";
    if (!STATUS_VALUES.includes(nextStatus)) {
      return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(", ")}` });
    }

    booking.technicianId = technicianId;
    booking.technicianName = technicianName;
    booking.technicianPhone = technicianPhone;
    booking.technician = technicianName;
    booking.status = nextStatus;

    const updated = await booking.save();

    try {
      const notification = await sendBookingStatusNotifications(
        typeof updated.toObject === "function" ? updated.toObject() : updated,
        previousStatus
      );
      const notificationErrors = [...(notification.email?.errors || []), ...(notification.whatsapp?.errors || [])];
      if (notificationErrors.length > 0) {
        console.warn("Booking assign notification warnings:", notificationErrors.join(" | "));
      }
    } catch (notificationError) {
      console.warn("Booking assign notification service error:", notificationError.message);
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update Booking Status
app.put("/api/bookings/:id/status", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const status = cleanString(req.body?.status);
    const adminNote = cleanString(req.body?.adminNote);

    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    if (!STATUS_VALUES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(", ")}` });
    }

    const previousStatus = booking.status || "Pending";
    const previousAdminNote = booking.adminNote || "";
    booking.status = status;

    if (typeof req.body?.adminNote === "string") {
      booking.adminNote = adminNote;
    }

    const updated = await booking.save();

    const shouldNotify =
      previousStatus.toLowerCase() !== status.toLowerCase() ||
      (typeof req.body?.adminNote === "string" &&
        cleanString(req.body.adminNote) !== cleanString(previousAdminNote));

    if (shouldNotify) {
      try {
        const notification = await sendBookingStatusNotifications(
          typeof updated.toObject === "function" ? updated.toObject() : updated,
          previousStatus
        );
        const notificationErrors = [...(notification.email?.errors || []), ...(notification.whatsapp?.errors || [])];
        if (notificationErrors.length > 0) {
          console.warn("Booking status notification warnings:", notificationErrors.join(" | "));
        }
      } catch (notificationError) {
        console.warn("Booking status notification service error:", notificationError.message);
      }
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update Live Location
app.put("/api/bookings/:id/live-location", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const lat = toNumberOrNull(req.body?.lat ?? req.body?.liveLocation?.lat);
    const lng = toNumberOrNull(req.body?.lng ?? req.body?.liveLocation?.lng);
    const requestedStatus = cleanString(req.body?.status);
    const previousMapUrl = booking.mapUrl || "";

    if (lat === null || lng === null) {
      return res.status(400).json({ error: "lat and lng are required numbers" });
    }

    if (requestedStatus && !STATUS_VALUES.includes(requestedStatus)) {
      return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(", ")}` });
    }

    const previousStatus = booking.status || "Pending";

    booking.liveLocation = {
      lat,
      lng,
      updatedAt: new Date(),
    };
    booking.mapUrl = buildGoogleMapUrl(lat, lng);

    if (requestedStatus) {
      booking.status = requestedStatus;
    }

    if (typeof req.body?.adminNote === "string") {
      booking.adminNote = cleanString(req.body.adminNote);
    }

    const updated = await booking.save();
    const statusChanged = requestedStatus && previousStatus.toLowerCase() !== requestedStatus.toLowerCase();
    const mapBecameAvailable = !previousMapUrl && Boolean(updated.mapUrl);

    if (statusChanged || mapBecameAvailable) {
      try {
        const notification = await sendBookingStatusNotifications(
          typeof updated.toObject === "function" ? updated.toObject() : updated,
          previousStatus
        );
        const notificationErrors = [...(notification.email?.errors || []), ...(notification.whatsapp?.errors || [])];
        if (notificationErrors.length > 0) {
          console.warn("Booking live-location status notification warnings:", notificationErrors.join(" | "));
        }
      } catch (notificationError) {
        console.warn("Booking live-location status notification service error:", notificationError.message);
      }
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update Booking
app.put("/api/bookings/:id", async (req, res) => {
  try {
    const existingBooking = await Booking.findById(req.params.id);
    if (!existingBooking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const previousStatus = existingBooking.status || "Pending";
    const statusProvided = typeof req.body?.status === "string";
    const adminNoteProvided = typeof req.body?.adminNote === "string";
    const serviceProvided = typeof req.body?.service === "string";
    const technicianProvided =
      typeof req.body?.technician === "string" || typeof req.body?.technicianName === "string";
    const technicianPhoneProvided = typeof req.body?.technicianPhone === "string";
    const previousAdminNote = cleanString(existingBooking.adminNote || "");
    const previousTechnicianName = cleanString(
      existingBooking.technicianName || existingBooking.technician || ""
    );
    const previousTechnicianPhone = cleanPhone(existingBooking.technicianPhone || "");
    const previousMapUrl = cleanString(existingBooking.mapUrl || "");
    const previousPickupAddress = cleanString(existingBooking.pickupAddress || "");
    const previousPickupPhone = cleanPhone(existingBooking.pickupPhone || "");

    const updates = {};
    const editableStringFields = [
      "name",
      "phone",
      "email",
      "address",
      "location",
      "pickupAddress",
      "pickupPhone",
      "pickupMapUrl",
      "service",
      "status",
      "pickupOption",
      "technician",
      "technicianName",
      "technicianPhone",
      "adminNote",
      "brand",
      "model",
      "issueOne",
      "issueTwo",
      "mapUrl",
    ];

    editableStringFields.forEach((field) => {
      if (typeof req.body?.[field] === "string") {
        updates[field] = field === "email" ? cleanString(req.body[field]).toLowerCase() : cleanString(req.body[field]);
      }
    });

    if (Array.isArray(req.body?.selectedIssues)) {
      updates.selectedIssues = req.body.selectedIssues
        .map((item) => String(item || "").trim())
        .filter(Boolean);
    }

    if (updates.address && !Object.prototype.hasOwnProperty.call(updates, "location")) {
      updates.location = updates.address;
    }

    if (updates.location && !Object.prototype.hasOwnProperty.call(updates, "address")) {
      updates.address = updates.location;
    }

    const pickupAddressProvided = typeof req.body?.pickupAddress === "string";
    const pickupPhoneProvided = typeof req.body?.pickupPhone === "string";
    const pickupOptionChanged = Object.prototype.hasOwnProperty.call(updates, "pickupOption");
    const addressChanged =
      Object.prototype.hasOwnProperty.call(updates, "address") ||
      Object.prototype.hasOwnProperty.call(updates, "location");

    if (pickupAddressProvided) {
      updates.pickupAddress = cleanString(req.body.pickupAddress);
    } else if (pickupOptionChanged || addressChanged) {
      const effectivePickupOption = updates.pickupOption || existingBooking.pickupOption || "Pickup & Drop";
      const effectiveAddress = updates.address || existingBooking.address || "";
      updates.pickupAddress = effectivePickupOption === "Pickup & Drop" ? cleanString(effectiveAddress) : "";
    }

    if (Object.prototype.hasOwnProperty.call(updates, "pickupAddress")) {
      updates.pickupMapUrl = buildAddressMapUrl(updates.pickupAddress);
    }

    if (pickupPhoneProvided) {
      updates.pickupPhone = cleanPhone(req.body.pickupPhone);
    } else if (pickupOptionChanged && (updates.pickupOption || "").toLowerCase() !== "pickup & drop") {
      updates.pickupPhone = "";
    } else if (
      pickupOptionChanged &&
      (updates.pickupOption || "").toLowerCase() === "pickup & drop" &&
      !Object.prototype.hasOwnProperty.call(updates, "pickupPhone")
    ) {
      updates.pickupPhone = updates.phone || existingBooking.phone || "";
    }

    if (updates.status && !STATUS_VALUES.includes(updates.status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(", ")}` });
    }

    if (technicianProvided) {
      const technicianName =
        cleanString(req.body?.technicianName) || cleanString(req.body?.technician) || updates.technicianName || "";
      updates.technicianName = technicianName;
      updates.technician = technicianName;
    }

    if (technicianPhoneProvided) {
      updates.technicianPhone = cleanPhone(req.body?.technicianPhone);
    }

    if (mongoose.Types.ObjectId.isValid(req.body?.technicianId || "")) {
      updates.technicianId = req.body.technicianId;
    } else if (req.body?.technicianId === null || req.body?.technicianId === "") {
      updates.technicianId = null;
    }

    const lat = toNumberOrNull(req.body?.liveLocation?.lat ?? req.body?.lat);
    const lng = toNumberOrNull(req.body?.liveLocation?.lng ?? req.body?.lng);

    if (lat !== null && lng !== null) {
      updates.liveLocation = { lat, lng, updatedAt: new Date() };
      if (!updates.mapUrl) {
        updates.mapUrl = buildGoogleMapUrl(lat, lng);
      }
    }

    const booking = await Booking.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: "after",
      runValidators: true,
    });

    const nextStatus = booking?.status || "Pending";
    const statusChanged =
      statusProvided && String(previousStatus).trim().toLowerCase() !== String(nextStatus).trim().toLowerCase();
    const adminNoteChanged =
      adminNoteProvided &&
      previousAdminNote !== cleanString(booking?.adminNote || "");
    const serviceChanged =
      serviceProvided && cleanString(existingBooking.service || "") !== cleanString(booking?.service || "");
    const technicianChanged =
      technicianProvided &&
      previousTechnicianName !== cleanString(booking?.technicianName || booking?.technician || "");
    const technicianPhoneChanged =
      technicianPhoneProvided && previousTechnicianPhone !== cleanPhone(booking?.technicianPhone || "");
    const mapAddedOrChanged =
      (lat !== null && lng !== null) || (cleanString(booking?.mapUrl || "") !== previousMapUrl);
    const pickupAddressChanged =
      Object.prototype.hasOwnProperty.call(updates, "pickupAddress") &&
      cleanString(booking?.pickupAddress || "") !== previousPickupAddress;
    const pickupPhoneChanged =
      Object.prototype.hasOwnProperty.call(updates, "pickupPhone") &&
      cleanPhone(booking?.pickupPhone || "") !== previousPickupPhone;
    const shouldNotifyCustomer =
      statusChanged ||
      adminNoteChanged ||
      serviceChanged ||
      technicianChanged ||
      technicianPhoneChanged ||
      mapAddedOrChanged ||
      pickupAddressChanged ||
      pickupPhoneChanged;

    if (shouldNotifyCustomer) {
      try {
        const statusNotificationResult = await sendBookingStatusNotifications(
          typeof booking.toObject === "function" ? booking.toObject() : booking,
          previousStatus
        );

        const statusErrors = [
          ...(statusNotificationResult.email?.errors || []),
          ...(statusNotificationResult.whatsapp?.errors || []),
        ];

        if (statusErrors.length > 0) {
          console.warn("Booking status notification warnings:", statusErrors.join(" | "));
        }
      } catch (notificationError) {
        console.warn("Booking status notification service error:", notificationError.message);
      }
    }

    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete Booking
app.delete("/api/bookings/:id", async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
