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

// ✅ IMPORTANT FIX (newline issue)
serviceAccount.private_key = serviceAccount.private_key.replace(/\n/g, '\n');

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
✅ TEST ROUTE
========================= */
app.get("/", (req, res) => {
res.send("Backend running ✅");
});

/* =========================
🧾 CREATE ORDER
========================= */
app.post("/create-order", async (req, res) => {
try {
const { amount } = req.body;

```
if (!amount) {
  return res.status(400).json({ error: "Amount required" });
}

const order = await razorpay.orders.create({
  amount: amount * 100,
  currency: "INR",
  receipt: "receipt_" + Date.now(),
});

console.log("🧾 Order created:", order.id);

res.json(order);
```

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

```
// ✅ DB SAFETY CHECK
if (!db) {
  console.error("❌ Firestore not initialized");
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

console.log("🔍 VERIFY BODY:", req.body);

// ✅ VALIDATION
if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
  return res.status(400).json({ success: false, message: "Missing data" });
}

/* =========================
   🔐 SIGNATURE VERIFY
========================= */
const body = razorpay_order_id + "|" + razorpay_payment_id;

const expectedSignature = crypto
  .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
  .update(body)
  .digest("hex");

console.log("EXPECTED:", expectedSignature);
console.log("RECEIVED:", razorpay_signature);

if (expectedSignature !== razorpay_signature) {
  console.log("❌ Signature mismatch");
  return res.status(400).json({ success: false, message: "Invalid signature" });
}

console.log("✅ Payment Verified");

const createdAt = new Date();
const renewalDate = new Date();
renewalDate.setDate(renewalDate.getDate() + 30);

/* =========================
   🔥 SAVE PAYMENT (NO DUPLICATE)
========================= */
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
  createdAt,
  renewalDate,
});

console.log("🔥 Payment saved");

/* =========================
   🔥 UPDATE USER SUBSCRIPTION
========================= */
await db.collection("users").doc(userId).set({
  package: packageName,
  status: "active",
  renewalDate,
  paymentId: razorpay_payment_id,
}, { merge: true });

console.log("🔥 User updated");

return res.json({
  success: true,
  message: "Payment verified & package activated",
});
```

} catch (err) {
console.error("🔥 Verification Error:", err);
res.status(500).json({ success: false, error: "Verification failed" });
}
});

/* =========================
🚀 START SERVER
========================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
console.log(`🚀 Server running on port ${PORT}`);
});
