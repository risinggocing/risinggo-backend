const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");

const app = express(); // ✅ FIRST define app

app.use(cors());
app.use(express.json());

// 🔥 Firebase setup
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// 🔐 Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Test
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
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      packageName,
    } = req.body;

    console.log("VERIFY BODY:", req.body);

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {

      console.log("Payment Verified ✅");

      // 🔥 SAVE PAYMENT
      await db.collection("payments").add({
        userId,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        package: packageName,
        status: "success",
        createdAt: new Date(),
      });

      console.log("🔥 Payment saved");

      // 🔥 UPDATE USER
      await db.collection("users").doc(userId).set({
        package: packageName,
        status: "active",
      }, { merge: true });

      console.log("🔥 User updated");

      return res.json({ success: true });

    } else {
      return res.status(400).json({ success: false });
    }

  } catch (err) {
    console.error("🔥 ERROR:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
