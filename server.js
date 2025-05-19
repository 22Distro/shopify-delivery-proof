const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// 🔐 ENV Vars
const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  SHOPIFY_DOMAIN,
  ADMIN_API_TOKEN
} = process.env;

// 🔧 Cloudinary config
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

// 📸 Upload to Cloudinary
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

// 🚚 Main route to handle delivery proof
app.post('/submit-proof', async (req, res) => {
  const { orderNumber, customerName, photoDataURL, signatureDataURL } = req.body;

  if (!orderNumber || !photoDataURL || !signatureDataURL || !customerName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
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

    // 🖼 Upload both images
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const photoURL = await uploadToCloudinary(photoDataURL, `${orderNumber}-photo-${timestamp}`);
    const signatureURL = await uploadToCloudinary(signatureDataURL, `${orderNumber}-signature-${timestamp}`);

    // 💬 Create clickable comment
    const commentHTML = `
      <p><strong>📦 Proof of Delivery for ${customerName}</strong></p>
      <p>📸 <a href="${photoURL}" target="_blank">View Photo</a></p>
      <p>✍️ <a href="${signatureURL}" target="_blank">View Signature</a></p>
    `;

    // 📝 Post comment on order
    await axios.post(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${order.id}/events.json`,
      {
        event: {
          subject_type: 'Order',
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
    console.error('🔥 ERROR:', err.response?.data || err.message);
    res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});

// ✅ Health check
app.get('/health', (req, res) => {
  res.send('✅ Server is up and running!');
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
