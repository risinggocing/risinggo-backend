const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
🔥 FIREBASE SETUP
========================= */
let db;

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  db = admin.firestore();
  console.log("🔥 Firebase initialized SUCCESS");

} catch (err) {
  console.error("🔥 Firebase INIT ERROR:", err);
}

/* =========================
🔐 RAZORPAY SETUP
========================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* =========================
📦 PACKAGE CONFIG (UPDATED)
========================= */
const packageConfig = {
  "Shopify / WooCommerce Store Setup": { price: 4999, type: "one-time", sac: "998314" },
  "Product Listing (50 Products)": { price: 2499, type: "one-time", sac: "998314" },
  "Social Media Shop Setup (FB/IG)": { price: 1999, type: "one-time", sac: "998361" },
  "E-commerce Marketing (Ads)": { price: 5999, type: "monthly", sac: "998361" },
  "Branding & Logo Design": { price: 2999, type: "one-time", sac: "998361" },
  "Dropshipping Setup": { price: 9999, type: "one-time", sac: "998314" },
  "CRM & Order Management System": { price: 4999, type: "one-time", sac: "998314" },

  "Digital Shop (Entry Pack)": { price: 2999, type: "one-time", sac: "998361" },
  "E-commerce Starter Pack": { price: 6999, type: "one-time", sac: "998314" },
  "E-commerce Growth Pack": { price: 14999, type: "one-time", sac: "998314" },

  "Sales Booster": { price: 7999, type: "monthly", sac: "998361" },

  "Google Visibility Pack": { price: 99, type: "one-time", sac: "998361" },
  "Lead Generation System Pack": { price: 999, type: "one-time", sac: "998312" },
  "Super Entry Pack": { price: 2999, type: "one-time", sac: "998361" },
  "Ultra Low Entry Pack": { price: 4999, type: "one-time", sac: "998361" },

  "Visibility Need Package": { price: 19999, type: "monthly", sac: "998361" },
  "Lead Need Package": { price: 34999, type: "monthly", sac: "998312" },
  "Sales Need Package": { price: 69999, type: "monthly", sac: "998361" },
  "Brand Need Package": { price: 109999, type: "monthly", sac: "998361" },
};

/* =========================
🧮 GST FUNCTION
========================= */
function calculateGST(price, state) {
  const gstRate = 0.18;
  const gstAmount = price * gstRate;

  if (state === "Bihar") {
    return {
      cgst: gstAmount / 2,
      sgst: gstAmount / 2,
      igst: 0,
      total: price + gstAmount,
      type: "CGST+SGST",
    };
  } else {
    return {
      cgst: 0,
      sgst: 0,
      igst: gstAmount,
      total: price + gstAmount,
      type: "IGST",
    };
  }
}

/* =========================
🧮 DATE HELPERS
========================= */
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

/* =========================
✅ TEST ROUTE
========================= */
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

/* =========================
🧾 CREATE ORDER (UPDATED)
========================= */
app.post("/create-order", async (req, res) => {
  try {
    const { packageName, state } = req.body;

    const config = packageConfig[packageName];
    if (!config) {
      return res.status(400).json({ error: "Invalid package" });
    }

    const gstData = calculateGST(config.price, state);

    const order = await razorpay.orders.create({
      amount: Math.round(gstData.total * 100),
      currency: "INR",
      receipt: "receipt_" + Date.now(),
      notes: {
        package: packageName,
        sac: config.sac,
        gst_type: gstData.type,
        gstin: "10AAPCR4262H1ZF",
      },
    });

    res.json({
      order,
      breakdown: {
        basePrice: config.price,
        gst: gstData,
        total: gstData.total,
      },
    });

  } catch (err) {
    console.error("❌ Order Error:", err);
    res.status(500).json({ error: "Order failed" });
  }
});

/* =========================
✅ VERIFY PAYMENT
========================= */
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
      state,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    const config = packageConfig[packageName];
    const gstData = calculateGST(config.price, state);

    const purchaseDate = new Date();
    let expiryDate = null;
    let renewalDate = null;

    if (config.type === "one-time") {
      expiryDate = addDays(purchaseDate, 7);
    } else {
      renewalDate = addMonths(purchaseDate, 1);
    }

    await db.collection("payments").doc(razorpay_payment_id).set({
      userId,
      name,
      email,
      contact,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      package: packageName,

      baseAmount: config.price,
      gstAmount: gstData.cgst + gstData.sgst + gstData.igst,
      gstType: gstData.type,
      cgst: gstData.cgst,
      sgst: gstData.sgst,
      igst: gstData.igst,
      totalAmount: gstData.total,

      sacCode: config.sac,
      gstin: "10AAPCR4262H1ZF",

      status: "success",
      purchaseDate,
      expiryDate,
      renewalDate,
      packageType: config.type,
    });

    await db.collection("users").doc(userId).set({
      package: packageName,
      status: "active",
      purchaseDate,
      expiryDate,
      renewalDate,
      packageType: config.type,
      paymentId: razorpay_payment_id,
    }, { merge: true });

    return res.json({
      success: true,
      message: "Payment verified & GST stored",
    });

  } catch (err) {
    console.error("🔥 Verification Error:", err);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
});

/* =========================
📊 GET USER PACKAGE STATUS
========================= */
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
      remainingDays = Math.ceil((data.expiryDate.toDate() - now) / (1000 * 60 * 60 * 24));
      if (remainingDays <= 0) status = "expired";
    }

    if (data.packageType === "monthly" && data.renewalDate) {
      remainingDays = Math.ceil((data.renewalDate.toDate() - now) / (1000 * 60 * 60 * 24));
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

/* =========================
🚀 START SERVER
========================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
