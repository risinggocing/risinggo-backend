app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      packageName,
    } = req.body;

    console.log("🔍 VERIFY BODY:", req.body);

    // ❌ Missing data check
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.log("❌ Missing payment fields");
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    // 🔐 Signature verify
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    console.log("EXPECTED:", expectedSignature);
    console.log("RECEIVED:", razorpay_signature);

    if (expectedSignature === razorpay_signature) {

      console.log("✅ Payment Verified");

      // 🔥 Check userId + packageName
      if (!userId || !packageName) {
        console.log("❌ Missing userId or packageName");
        return res.status(400).json({ success: false, message: "User data missing" });
      }

      // 🔥 SAVE PAYMENT
      try {
        await db.collection("payments").add({
          userId,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          package: packageName,
          status: "success",
          createdAt: new Date(),
        });

        console.log("🔥 Payment saved in Firebase");
      } catch (err) {
        console.error("🔥 Firebase Save Error:", err);
        return res.status(500).json({ success: false, error: "Payment save failed" });
      }

      // 🔥 UPDATE USER PACKAGE
      try {
        await db.collection("users").doc(userId).set({
          package: packageName,
          status: "active",
        }, { merge: true });

        console.log("🔥 User package activated");
      } catch (err) {
        console.error("🔥 User Update Error:", err);
        return res.status(500).json({ success: false, error: "User update failed" });
      }

      return res.json({
        success: true,
        message: "Payment verified & package activated",
      });

    } else {
      console.log("❌ Signature mismatch");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

  } catch (err) {
    console.error("🔥 Verification Error:", err);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
});
