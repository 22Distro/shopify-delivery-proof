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

// ✅ Configure Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

// 🔼 Upload base64 image to Cloudinary
async function uploadToCloudinary(base64Image, filename) {
  const res = await cloudinary.uploader.upload(base64Image, {
    public_id: `delivery-proof/${filename}`,
    overwrite: true
  });
  return res.secure_url;
}

// 🚚 Main POST route
app.post('/submit-proof', async (req, res) => {
  const { orderNumber, customerName, photoDataURL } = req.body;

  try {
    // ✅ Get Shopify order by order_number
    const orderRes = await axios.get(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json?order_number=${encodeURIComponent(orderNumber)}`,
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN
        }
      }
    );

    const order = orderRes.data.orders[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const filename = `${orderNumber}-delivery-${timestamp}`;

    const imageUrl = await uploadToCloudinary(photoDataURL, filename);

    // 💾 Save Cloudinary image URL to Shopify metafield
    await axios.put(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${order.id}/metafields.json`,
      {
        metafield: {
          namespace: "custom",
          key: "delivery_image",
          value: imageUrl,
          type: "url"
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, url: imageUrl });
  } catch (err) {
    console.error("🔥 ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});

app.listen(3000, () => console.log('✅ Server running on port 3000'));
