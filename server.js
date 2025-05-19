const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Allow your Shopify storefront to send requests
app.use(cors({
  origin: 'https://www.22distro.com'
}));

app.use(bodyParser.json({ limit: '10mb' }));

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;

async function uploadToShopifyFiles(dataURL, filename) {
  const res = await axios.post(
    `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/files.json`,
    { file: { attachment: dataURL, filename } },
    {
      headers: {
        'X-Shopify-Access-Token': ADMIN_API_TOKEN,
        'Accept': 'application/json'
      }
    }
  );
  return res.data.file.original_src;
}

app.post('/submit-proof', async (req, res) => {
  const { orderNumber, customerName, photoDataURL, signatureDataURL } = req.body;

  try {
    const orderRes = await axios.get(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json?name=${encodeURIComponent(orderNumber)}`,
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Accept': 'application/json'
        }
      }
    );

    const order = orderRes.data.orders[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const photoURL = await uploadToShopifyFiles(photoDataURL, `photo-${orderNumber}.jpg`);
    const signatureURL = await uploadToShopifyFiles(signatureDataURL, `signature-${orderNumber}.png`);

    await axios.post(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${order.id}/events.json`,
      {
        event: {
          subject_type: "Order",
          body: `<p><strong>Proof of Delivery for ${customerName}</strong></p>
                 <p><img src="${photoURL}" /></p>
                 <p><img src="${signatureURL}" /></p>`
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Accept': 'application/json'
        }
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("🔥 SERVER ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
