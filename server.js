const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

/* ========================= 🔥 FIREBASE SETUP ========================= */
let db;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

  // ✅ FIX PRIVATE KEY
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  db = admin.firestore();
  console.log("🔥 Firebase initialized SUCCESS");
} catch (err) {
  console.error("🔥 Firebase INIT ERROR:", err);
}

/* ========================= 🔐 RAZORPAY SETUP ========================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ========================= 📦 PACKAGE CONFIG ========================= */
const packageConfig = {
  "Starter Pack": { type: "one-time", days: 3 },
  "Super Entry Pack": { type: "one-time", days: 5 },
  "Ultra Low Entry Pack": { type: "one-time", days: 7 },
  "Growth Pack": { type: "monthly" },
  "Pro Pack": { type: "monthly" },

  // ✅ NEW SERVICES ADDED (NO OTHER CHANGES)

  "Google Visibility Pack": { type: "one-time", days: 3 },

  "Lead Generation System Pack (Best Seller)": {
    type: "one-time",
    days: 3,
  },
};

/* ========================= 🧮 DATE HELPERS ========================= */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/* ========================= ✅ TEST ROUTE ========================= */
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

/* ========================= 🧾 CREATE ORDER ========================= */
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Amount required" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    });

    res.json(order);
  } catch (err) {
    console.error("❌ Order Error:", err);
    res.status(500).json({ error: "Order failed" });
  }
});

/* ========================= ✅ VERIFY PAYMENT + PACKAGE LOGIC ========================= */
app.post("/verify-payment", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, message: "DB error" });
    }

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

    /* ========================= 🔐 SIGNATURE VERIFY ========================= */
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    console.log("✅ Payment Verified");

    /* ========================= 📦 PACKAGE LOGIC ========================= */
    const config = packageConfig[packageName];

    if (!config) {
      return res.status(400).json({
        success: false,
        message: "Invalid package",
      });
    }

    const purchaseDate = new Date();
    let expiryDate = null;
    let renewalDate = null;

    if (config.type === "one-time") {
      expiryDate = addDays(purchaseDate, config.days);
    } else {
      renewalDate = addMonths(purchaseDate, 1);
    }

    /* ========================= 🔥 SAVE PAYMENT (NO DUPLICATE) ========================= */
    await db.collection("payments").doc(razorpay_payment_id).set({
      userId,
      name,
      email,
      contact,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      package: packageName,
      amount,
      status: "success",
      purchaseDate,
      expiryDate,
      renewalDate,
      packageType: config.type,
    });

    /* ========================= 🔥 UPDATE USER ========================= */
    await db.collection("users").doc(userId).set(
      {
        package: packageName,
        status: "active",
        purchaseDate,
        expiryDate,
        renewalDate,
        packageType: config.type,
        paymentId: razorpay_payment_id,
      },
      { merge: true }
    );

    return res.json({
      success: true,
      message: "Payment verified & package activated",
    });
  } catch (err) {
    console.error("🔥 Verification Error:", err);
    res.status(500).json({
      success: false,
      error: "Verification failed",
    });
  }
});

/* ========================= 📊 GET USER PACKAGE STATUS ========================= */
app.get("/my-package/:userId", async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.params.userId).get();

    if (!userDoc.exists) {
      return res.json({ package: null });
    }

    const data = userDoc.data();
    const now = new Date();

    let remainingDays = 0;
    let status = "active";

    if (data.packageType === "one-time" && data.expiryDate) {
      remainingDays = Math.ceil(
        (data.expiryDate.toDate() - now) / (1000 * 60 * 60 * 24)
      );

      if (remainingDays <= 0) status = "expired";
    }

    if (data.packageType === "monthly" && data.renewalDate) {
      remainingDays = Math.ceil(
        (data.renewalDate.toDate() - now) / (1000 * 60 * 60 * 24)
      );

      if (remainingDays <= 0) status = "expired";
    }

    res.json({
      ...data,
      remainingDays,
      status,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

/* ========================= 🚀 START SERVER ========================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
