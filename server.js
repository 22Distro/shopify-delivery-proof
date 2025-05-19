const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  SHOPIFY_DOMAIN,
  ADMIN_API_TOKEN
} = process.env;

// Configure Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

// Upload base64 image to Cloudinary
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

// 🔍 Debug route to confirm order lookup
app.get('/test-order/:orderNumber', async (req, res) => {
  const orderNumber = req.params.orderNumber;

  try {
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
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      name: order.name,
      customer: order.customer?.first_name + ' ' + order.customer?.last_name
    });
  } catch (err) {
    console.error("❌ Order lookup error:", err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch order', details: err.message });
  }
});

// 📦 Submit Proof of Delivery
app.post('/submit-proof', async (req, res) => {
  const { orderNumber, customerName, photoDataURL, signatureDataURL } = req.body;

  try {
    if (!orderNumber || !photoDataURL || !signatureDataURL || !customerName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find Shopify order
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

    // Upload images
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const photoURL = await uploadToCloudinary(photoDataURL, `${orderNumber}-photo-${timestamp}`);
    const signatureURL = await uploadToCloudinary(signatureDataURL, `${orderNumber}-signature-${timestamp}`);

    // Plain text comment
    const plainComment = `Proof of Delivery for ${customerName}\nPhoto: ${photoURL}\nSignature: ${signatureURL}`;

    await axios.post(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${order.id}/events.json`,
      {
        event: {
          subject_type: "Order",
          body: plainComment
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

// 🩺 Health check
app.get('/health', (req, res) => {
  res.send('✅ Server is up and running!');
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
