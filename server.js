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

const app = express();
const PORT = process.env.PORT || 5000;
const { sendBookingEmail } = require("./services/bookingNotifications");

/* ================= DATABASE ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("✅ MongoDB Connected");
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
})
.catch(err => console.log("MongoDB error:", err));

/* ================= MIDDLEWARE ================= */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================= ROOT ================= */

app.get("/", (req,res)=>{
  res.send("Server is running ✅");
});

/* ================= PASSWORD UTILS ================= */

const hashPassword = (password,salt)=>
crypto.pbkdf2Sync(password,salt,100000,64,"sha512").toString("hex");

const generateToken = ()=>crypto.randomBytes(24).toString("hex");

/* ================= ADMIN ================= */

app.post("/api/admin/register", async(req,res)=>{
  try{

    const {name,email,password}=req.body;

    const exist = await Admin.findOne({email});
    if(exist) return res.status(400).json({error:"Email exists"});

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(password,salt);

    const admin = await Admin.create({
      name,
      email,
      passwordHash:hash,
      passwordSalt:salt
    });

    res.json(admin);

  }catch(err){
    res.status(500).json({error:err.message});
  }
});

app.post("/api/admin/login", async(req,res)=>{
  try{

    const {email,password}=req.body;

    const admin = await Admin.findOne({email});
    if(!admin) return res.status(401).json({error:"Invalid login"});

    const hash = hashPassword(password,admin.passwordSalt);
    if(hash!==admin.passwordHash)
      return res.status(401).json({error:"Invalid login"});

    res.json({
      message:"Login success",
      token:generateToken(),
      admin
    });

  }catch(err){
    res.status(500).json({error:err.message});
  }
});

/* ================= BRANDS ================= */

app.post("/api/brands", async(req,res)=>{
  const brand = await Brand.create(req.body);
  res.json(brand);
});

app.get("/api/brands", async(req,res)=>{
  const brands = await Brand.find().sort({createdAt:-1});
  res.json(brands);
});

app.put("/api/brands/:id", async(req,res)=>{
  const brand = await Brand.findByIdAndUpdate(req.params.id,req.body,{new:true});
  res.json(brand);
});

app.delete("/api/brands/:id", async(req,res)=>{
  await Model.deleteMany({brandId:req.params.id});
  await Brand.findByIdAndDelete(req.params.id);
  res.json({message:"Brand deleted"});
});

/* ================= MODELS ================= */

app.post("/api/models", async(req,res)=>{
  const model = await Model.create(req.body);
  res.json(model);
});

app.get("/api/models", async(req,res)=>{
  const models = await Model.find().populate("brandId");
  res.json(models);
});

app.put("/api/models/:id", async(req,res)=>{
  const model = await Model.findByIdAndUpdate(req.params.id,req.body,{new:true});
  res.json(model);
});

app.delete("/api/models/:id", async(req,res)=>{
  await Model.findByIdAndDelete(req.params.id);
  res.json({message:"Model deleted"});
});

/* ================= TECHNICIANS ================= */

app.post("/api/technicians", async(req,res)=>{
  const tech = await Technician.create(req.body);
  res.json({message:"Technician added",technician:tech});
});

app.get("/api/technicians", async(req,res)=>{
  const techs = await Technician.find().sort({createdAt:-1});
  res.json(techs);
});

app.put("/api/technicians/:id", async(req,res)=>{
  const tech = await Technician.findByIdAndUpdate(req.params.id,req.body,{new:true});
  res.json(tech);
});

app.delete("/api/technicians/:id", async(req,res)=>{
  await Technician.findByIdAndDelete(req.params.id);
  res.json({message:"Deleted"});
});


/* ================= BOOKINGS ================= */

app.post("/api/bookings", async (req, res) => {
  try {

    const booking = await Booking.create(req.body);

    // SEND EMAIL
    if (booking.email) {
      await sendBookingEmail(booking);
    }

    res.json({
      trackingId: booking.trackingId,
      phone: booking.phone
    });

  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .populate("technicianId");

    res.json(bookings);
  } catch (error) {
    console.error("Fetch bookings error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/bookings/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("technicianId");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json(booking);
  } catch (error) {
    console.error("Single booking error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/bookings/:id", async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(booking);
  } catch (error) {
    console.error("Update booking error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/bookings/:id", async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);

    res.json({ message: "Booking deleted" });
  } catch (error) {
    console.error("Delete booking error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/bookings/track", async (req, res) => {
  try {
    const { trackingId, phone } = req.body;

    const booking = await Booking.findOne({
      trackingId: trackingId.trim().toUpperCase(),
      phone: phone.trim()
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json(booking);
  } catch (error) {
    console.error("Track booking error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= IMAGE UPLOAD ================= */
const filePath = path.join(__dirname, "uploads", path.basename(service.image));

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
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files allowed"), false);
    }
  }
});


/* ================= SERVICES ================= */

app.post("/api/services", upload.single("image"), async (req, res) => {
  try {

    const { name, subtitle } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Service name required" });
    }

    const exist = await Service.findOne({
      name: { $regex: new RegExp("^" + name + "$", "i") }
    });

    if (exist) {
      return res.status(400).json({ error: "Service already exists" });
    }

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


/* ================= GET SERVICES ================= */

app.get("/api/services", async (req, res) => {
  try {

    const services = await Service.find().sort({ createdAt: -1 });

    res.json(services);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ================= UPDATE SERVICE ================= */

app.put("/api/services/:id", upload.single("image"), async (req, res) => {
  try {

    const data = {};

    if (req.body.name) data.name = req.body.name;
    if (req.body.subtitle) data.subtitle = req.body.subtitle;

    if (req.file) {
      data.image = `/uploads/${req.file.filename}`;
    }

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true }
    );

    res.json(service);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ================= DELETE SERVICE ================= */
app.delete("/api/services/:id", async (req, res) => {
  try {

    const service = await Service.findById(req.params.id);

    if (service?.image) {

      const filePath = path.join(__dirname,"uploads",path.basename(service.image));

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

    }

    await Service.findByIdAndDelete(req.params.id);

    res.json({ message: "Service deleted" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
