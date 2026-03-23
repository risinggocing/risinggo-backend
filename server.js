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

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {

      console.log("Payment Verified ✅");

      // 🔥 1. Payment save
      await db.collection("payments").add({
        userId,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        package: packageName,
        status: "success",
        createdAt: new Date(),
      });

      // 🔥 2. User package activate
      await db.collection("users").doc(userId).set({
        package: packageName,
        status: "active",
      }, { merge: true });

      return res.json({ success: true });

    } else {
      return res.status(400).json({ success: false });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Verification failed" });
  }
});
