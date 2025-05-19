const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors({ origin: 'https://www.22distro.com' }));
app.use(bodyParser.json({ limit: '10mb' }));

const {
  SHOPIFY_DOMAIN,
  ADMIN_API_TOKEN
} = process.env;

// 📤 Upload base64 image to Shopify Files API
async function uploadToShopifyFiles(dataURL, filename) {
  const res = await axios.post(
    `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/files.json`,
    {
      file: {
        attachment: dataURL,
        filename
      }
    },
    {
      headers: {
        'X-Shopify-Access-Token': ADMIN_API_TOKEN,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }
  );

  return res.data.file.original_src;
}

// 🚚 POST route for delivery proof submission
app.post('/submit-proof', async (req, res) => {
  const { orderNumber, customerName, photoDataURL } = req.body;

  try {
    // 🔍 Find order by order_number
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

    // 🕓 Create timestamped filename
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const filename = `delivery-${orderNumber}-${timestamp}.jpg`;

    // ☁️ Upload to Shopify Files
    const imageUrl = await uploadToShopifyFiles(photoDataURL, filename);

    // 💾 Save file URL to metafield
    await axios.put(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${order.id}/metafields.json`,
      {
        metafield: {
          namespace: 'custom',
          key: 'delivery_image',
          type: 'url',
          value: imageUrl
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
    console.error('🔥 ERROR:', err.response?.data || err.message);
    res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});

app.listen(3000, () => console.log('✅ Server running on port 3000'));
