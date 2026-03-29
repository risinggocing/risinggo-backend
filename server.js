const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
🔥 FIREBASE
========================= */
let db;

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  db = admin.firestore();
} catch (err) {
  console.error("Firebase error");
}

/* =========================
🔐 RAZORPAY
========================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* =========================
📦 PACKAGE CONFIG (FAST)
========================= */
const packageConfig = {
  "Shopify / WooCommerce Store Setup": [4999, "one-time", "998314"],
  "Product Listing (50 Products)": [2499, "one-time", "998314"],
  "Social Media Shop Setup (FB/IG)": [1999, "one-time", "998361"],
  "E-commerce Marketing (Ads)": [5999, "monthly", "998361"],
  "Branding & Logo Design": [2999, "one-time", "998361"],
  "Dropshipping Setup": [9999, "one-time", "998314"],
  "CRM & Order Management System": [4999, "one-time", "998314"],
  "Digital Shop (Entry Pack)": [2999, "one-time", "998361"],
  "E-commerce Starter Pack": [6999, "one-time", "998314"],
  "E-commerce Growth Pack": [14999, "one-time", "998314"],
  "Sales Booster": [7999, "monthly", "998361"],
  "Google Visibility Pack": [99, "one-time", "998361"],
  "Lead Generation System Pack": [999, "one-time", "998312"],
  "Super Entry Pack": [2999, "one-time", "998361"],
  "Ultra Low Entry Pack": [4999, "one-time", "998361"],
  "Visibility Need Package": [19999, "monthly", "998361"],
  "Lead Need Package": [34999, "monthly", "998312"],
  "Sales Need Package": [69999, "monthly", "998361"],
  "Brand Need Package": [109999, "monthly", "998361"],
};

/* =========================
⚡ FAST GST
========================= */
function calcGST(price, isBihar) {
  const gst = price * 0.18;

  if (isBihar) {
    return [gst / 2, gst / 2, 0, price + gst, "CGST+SGST"];
  } else {
    return [0, 0, gst, price + gst, "IGST"];
  }
}

/* =========================
🧾 CREATE ORDER (FAST)
========================= */
app.post("/create-order", async (req, res) => {
  try {
    const { packageName, state } = req.body;

    const data = packageConfig[packageName];
    if (!data) return res.status(400).json({ error: "Invalid package" });

    const [price, , sac] = data;
    const [cgst, sgst, igst, total, type] = calcGST(price, state === "Bihar");

    const order = await razorpay.orders.create({
      amount: Math.round(total * 100),
      currency: "INR",
      receipt: "r_" + Date.now(),
      notes: { sac, type },
    });

    res.json({
      id: order.id,
      amount: total,
      gst: total - price,
    });

  } catch {
    res.status(500).json({ error: "Order failed" });
  }
});

/* =========================
✅ VERIFY PAYMENT (FAST)
========================= */
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      packageName,
      state,
    } = req.body;

    const sign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (sign !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    const data = packageConfig[packageName];
    const [price, type, sac] = data;
    const [cgst, sgst, igst, total] = calcGST(price, state === "Bihar");

    const now = new Date();

    const paymentData = {
      userId,
      paymentId: razorpay_payment_id,
      package: packageName,
      base: price,
      gst: cgst + sgst + igst,
      total,
      sac,
      gstin: "10AAPCR4262H1ZF",
      createdAt: now,
    };

    // ⚡ Parallel write (FAST)
    await Promise.all([
      db.collection("payments").doc(razorpay_payment_id).set(paymentData),
      db.collection("users").doc(userId).set({
        package: packageName,
        status: "active",
        updatedAt: now,
      }, { merge: true })
    ]);

    res.json({ success: true });

  } catch {
    res.status(500).json({ success: false });
  }
});

/* =========================
🚀 START
========================= */
app.listen(5000);
