const mongoose = require("mongoose");

const modelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    image: String,
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Model", modelSchema);
