const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  logo: { type: String, trim: true },
});

module.exports = mongoose.model("Brand", brandSchema);
