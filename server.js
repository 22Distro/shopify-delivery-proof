app.post('/submit-proof', async (req, res) => {
  const { orderNumber, customerName, photoDataURL, signatureDataURL } = req.body;

  try {
    if (!orderNumber || !photoDataURL || !signatureDataURL || !customerName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 🔍 Get Shopify order by order_number
    const orderRes = await axios.get(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json?order_number=${encodeURIComponent(orderNumber)}`,
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Accept': 'application/json'
        }
      }
    );

    const order = orderRes.data.orders?.[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const photoURL = await uploadToCloudinary(photoDataURL, `${orderNumber}-photo-${timestamp}`);
    const signatureURL = await uploadToCloudinary(signatureDataURL, `${orderNumber}-signature-${timestamp}`);

    // 📝 Add Shopify order comment with clickable links (HTML-safe)
    const commentHTML = `
      <p><strong>📦 Proof of Delivery for ${customerName}</strong></p>
      <p>📸 <a href="${photoURL}" target="_blank">View Photo</a></p>
      <p>✍️ <a href="${signatureURL}" target="_blank">View Signature</a></p>
    `;

    await axios.post(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${order.id}/events.json`,
      {
        event: {
          subject_type: "Order",
          body: commentHTML
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, photoURL, signatureURL });
  } catch (err) {
    console.error("🔥 ERROR:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data
    });
    res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});
