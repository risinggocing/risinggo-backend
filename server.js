const express = require("express");
const cors = require("cors"); // 👈 1. Import CORS
const crypto = require("crypto");
const app = express();

app.use(cors()); // 👈 2. Use CORS
app.use(express.json()); // 👈 3. Use JSON Parser

// ... your /create-order route ...

app.post("/verify-payment", (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // Check if data is missing
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      console.log("Payment Verified ✅");
      res.json({ success: true });
    } else {
      console.error("Signature Mismatch ❌");
      res.status(400).json({ success: false });
    }
  } catch (err) {
    console.error("Verification Error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));
