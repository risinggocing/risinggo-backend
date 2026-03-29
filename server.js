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
📦 PACKAGE CONFIG (FINAL)
========================= */
const packageConfig = {
  digital_shop: [2999, "one-time", "998361"],
  ecommerce_starter: [6999, "one-time", "998314"],
  ecommerce_growth: [14999, "one-time", "998314"],
  sales_booster: [7999, "monthly", "998361"],

  google_visibility: [99, "one-time", "998361"],
  lead_generation: [999, "one-time", "998312"],
  super_entry: [2999, "one-time", "998361"],
  ultra_low: [4999, "one-time", "998361"],

  visibility_need: [19999, "monthly", "998361"],
  lead_need: [34999, "monthly", "998312"],
  sales_need: [69999, "monthly", "998361"],
  brand_need: [109999, "monthly", "998361"],

  store_setup: [4999, "one-time", "998314"],
  product_listing: [2499, "one-time", "998314"],
  social_shop: [1999, "one-time", "998361"],
  ecommerce_ads: [5999, "monthly", "998361"],
  branding_logo: [2999, "one-time", "998361"],
  dropshipping: [9999, "one-time", "998314"],
  crm_system: [4999, "one-time", "998314"],
};

/* =========================
🧾 PACKAGE NAME MAP
========================= */
const packageNames = {
  digital_shop: "Digital Shop (Entry Pack)",
  ecommerce_starter: "E-commerce Starter Pack",
  ecommerce_growth: "E-commerce Growth Pack",
  sales_booster: "Sales Booster",

  google_visibility: "Google Visibility Pack",
  lead_generation: "Lead Generation System Pack",
  super_entry: "Super Entry Pack",
  ultra_low: "Ultra Low Entry Pack",

  visibility_need: "Visibility Need Package",
  lead_need: "Lead Need Package",
  sales_need: "Sales Need Package",
  brand_need: "Brand Need Package",

  store_setup: "Shopify Store Setup",
  product_listing: "Product Listing",
  social_shop: "Social Media Shop Setup",
  ecommerce_ads: "E-commerce Marketing",
  branding_logo: "Branding & Logo Design",
  dropshipping: "Dropshipping Setup",
  crm_system: "CRM System",
};

/* =========================
⚡ GST CALCULATION
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
✅ TEST
========================= */
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

/* =========================
🧾 CREATE ORDER
========================= */
app.post("/create-order", async (req, res) => {
  try {
    const { packageId, state } = req.body;

    const data = packageConfig[packageId];
    if (!data) {
      return res.status(400).json({ error: "Invalid package" });
    }

    const [price, , sac] = data;
    const [cgst, sgst, igst, total, type] = calcGST(price, state === "Bihar");

    const order = await razorpay.orders.create({
      amount: Math.round(total * 100),
      currency: "INR",
      receipt: "r_" + Date.now(),
      notes: {
        packageId,
        sac,
        gst_type: type,
        gstin: "10AAPCR4262H1ZF",
      },
    });

    res.json({
      orderId: order.id,
      amount: total,
      gst: total - price,
      name: packageNames[packageId],
    });

  } catch (err) {
    res.status(500).json({ error: "Order failed" });
  }
});

/* =========================
✅ VERIFY PAYMENT
========================= */
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      packageId,
      state,
      name,
      email,
      contact,
    } = req.body;

    const sign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (sign !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    const data = packageConfig[packageId];
    if (!data) return res.status(400).json({ success: false });

    const [price, type, sac] = data;
    const [cgst, sgst, igst, total, gstType] = calcGST(price, state === "Bihar");

    const now = new Date();

    const paymentData = {
      userId,
      name,
      email,
      contact,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      packageId,
      packageName: packageNames[packageId],

      baseAmount: price,
      gstAmount: cgst + sgst + igst,
      cgst,
      sgst,
      igst,
      totalAmount: total,
      gstType,

      sacCode: sac,
      gstin: "10AAPCR4262H1ZF",

      status: "success",
      createdAt: now,
      packageType: type,
    };

    await Promise.all([
      db.collection("payments").doc(razorpay_payment_id).set(paymentData),
      db.collection("users").doc(userId).set({
        packageId,
        packageName: packageNames[packageId],
        status: "active",
        updatedAt: now,
      }, { merge: true }),
    ]);

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* =========================
🚀 START SERVER
========================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
