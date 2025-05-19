const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

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

// 🔧 Cloudinary setup
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

// ⬆️ Upload base64 image to Cloudinary
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

// 🚚 Main upload route
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
          'Accept': 'application/json' // ✅ Important fix
        }
      }
    );

    const order = orderRes.data.orders?.[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const photoURL = await uploadToCloudinary(photoDataURL, `${orderNumber}-photo-${timestamp}`);
    const signatureURL = await uploadToCloudinary(signatureDataURL, `${orderNumber}-signature-${timestamp}`);

    // 📝 Add comment to Shopify order with image links
    await axios.post(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${order.id}/events.json`,
      {
        event: {
          subject_type: "Order",
          body: `
            <p><strong>📦 Proof of Delivery for ${customerName}</strong></p>
            <p><img src="${photoURL}" alt="Delivery Photo" style="max-width:300px;" /></p>
            <p><img src="${signatureURL}" alt="Customer Signature" style="max-width:300px;" /></p>
          `
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Accept': 'application/json', // ✅ Fix
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, photoURL, signatureURL });
  } catch (err) {
    console.error("🔥 ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});

app.listen(3000, () => console.log('✅ Server running on port 3000'));
