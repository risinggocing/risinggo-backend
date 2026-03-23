const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const crypto = require("crypto");

const app = express(); // ✅ FIRST define app

app.use(cors());
app.use(express.json());

// 🔐 Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Test route
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

// ✅ CREATE ORDER
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
    });

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Order failed" });
  }
});

// ✅ VERIFY PAYMENT
app.post("/verify-payment", (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    console.log("VERIFY BODY:", req.body);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    console.log("EXPECTED:", expectedSignature);
    console.log("RECEIVED:", razorpay_signature);

    if (expectedSignature === razorpay_signature) {
      console.log("Payment Verified ✅");
      res.json({ success: true });
    } else {
      console.log("Signature Mismatch ❌");
      res.status(400).json({ success: false });
    }

  } catch (err) {
    console.error("Verification Error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
