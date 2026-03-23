const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 Firebase Setup (SAFE)
let db;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  db = admin.firestore();
  console.log("🔥 Firebase initialized SUCCESS");
} catch (err) {
  console.error("🔥 Firebase INIT ERROR:", err);
}

// 🔐 Razorpay Setup
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
    console.error("Order Error:", err);
    res.status(500).json({ error: "Order failed" });
  }
});

// ✅ VERIFY PAYMENT + SAVE FULL DATA
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      name,
      email,
      contact,
      packageName,
      amount,
    } = req.body;

    console.log("🔍 VERIFY BODY:", req.body);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    // 🔐 Signature verify
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    console.log("EXPECTED:", expectedSignature);
    console.log("RECEIVED:", razorpay_signature);

    if (expectedSignature === razorpay_signature) {

      console.log("✅ Payment Verified");

      const createdAt = new Date();
      const renewalDate = new Date(createdAt);
      renewalDate.setDate(renewalDate.getDate() + 30);

      // 🔥 SAVE FULL PAYMENT DATA
      try {
        await db.collection("payments").add({
          userId,
          name,
          email,
          contact,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          package: packageName,
          amount,
          status: "success",
          createdAt,
          renewalDate,
        });

        console.log("🔥 Payment saved in Firebase");
      } catch (err) {
        console.error("🔥 Firebase Save Error:", err);
        return res.status(500).json({ success: false });
      }

      // 🔥 UPDATE USER SUBSCRIPTION
      try {
        await db.collection("users").doc(userId).set({
          package: packageName,
          status: "active",
          renewalDate,
        }, { merge: true });

        console.log("🔥 User updated");
      } catch (err) {
        console.error("🔥 User Update Error:", err);
      }

      return res.json({
        success: true,
        message: "Payment verified & package activated",
      });

    } else {
      console.log("❌ Signature mismatch");
      return res.status(400).json({ success: false });
    }

  } catch (err) {
    console.error("🔥 Verification Error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
