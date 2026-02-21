const mongoose = require("mongoose");

const modelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
    required: true
  }
});

module.exports = mongoose.model("Model", modelSchema);
