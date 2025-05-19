const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const qs = require('qs'); // ✅ Needed for form-encoded data

const app = express();
app.use(cors({ origin: 'https://www.22distro.com' }));
app.use(bodyParser.json({ limit: '10mb' }));

const {
  SHOPIFY_DOMAIN,
  ADMIN_API_TOKEN,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET
} = process.env;

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

async function uploadToCloudinary(base64, filename) {
  if (!base64 || !base64.startsWith('data:image/')) {
    throw new Error("Invalid image format.");
  }

  const result = await cloudinary.uploader.upload(base64, {
    public_id: filename,
    folder: 'delivery_proof',
    resource_type: 'image'
  });

  return result.secure_url;
}

app.post('/submit-proof', async (req, res) => {
  const { orderNumber, customerName, photoDataURL, signatureDataURL } = req.body;

  try {
    if (!orderNumber || !photoDataURL || !signatureDataURL || !customerName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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

    const commentHTML = `
      <p><strong>📦 Proof of Delivery for ${customerName}</strong></p>
      <p>📸 <a href="${photoURL}" target="_blank">View Photo</a></p>
      <p>✍️ <a href="${signatureURL}" target="_blank">View Signature</a></p>
    `;

    // ✅ Send form-encoded data using qs
    await axios.post(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${order.id}/events.json`,
      qs.stringify({
        event: {
          subject_type: "Order",
          body: commentHTML
        }
      }),
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
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

app.listen(3000, () => console.log('✅ Server running on port 3000'));
