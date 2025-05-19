const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors({ origin: 'https://www.22distro.com' }));
app.use(bodyParser.json({ limit: '10mb' }));

const {
  SHOPIFY_DOMAIN,
  ADMIN_API_TOKEN,
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_TENANT_ID
} = process.env;

const ONEDRIVE_USER_EMAIL = 'ej@22distro.com'; // ✅ Your Microsoft email
const ONEDRIVE_FOLDER_PATH = 'DeliveryProof';  // ✅ Top-level folder (not in Documents)

// 🔐 Get access token
async function getGraphAccessToken() {
  const res = await axios.post(
    `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    })
  );
  return res.data.access_token;
}

// ⬆️ Upload image to OneDrive
async function uploadToOneDrive(dataURL, filename) {
  const accessToken = await getGraphAccessToken();
  const buffer = Buffer.from(dataURL.split(',')[1], 'base64');

  const uploadUrl = `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER_EMAIL}/drive/root:/${ONEDRIVE_FOLDER_PATH}/${filename}:/content`;

  console.log("📤 Uploading to:", uploadUrl);

  const res = await axios.put(uploadUrl, buffer, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'image/jpeg'
    }
  });

  return res.data.id;
}

// 🔗 Generate public view link
async function createShareLink(itemId) {
  const accessToken = await getGraphAccessToken();

  const res = await axios.post(
    `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER_EMAIL}/drive/items/${itemId}/createLink`,
    { type: 'view', scope: 'anonymous' },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return res.data.link.webUrl;
}

// 🧾 Main POST handler
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
    const filename = `${orderNumber}-delivery-${timestamp}.jpg`;

    const itemId = await uploadToOneDrive(photoDataURL, filename);
    const shareLink = await createShareLink(itemId);

    // 📝 Save share link to order metafield
    await axios.put(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${order.id}/metafields.json`,
      {
        metafield: {
          namespace: 'custom',
          key: 'delivery_image',
          value: shareLink,
          type: 'url'
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, url: shareLink });
  } catch (err) {
    console.error("🔥 ERROR:", err.response?.data || err.message);
    res.status(500).json({ error: 'Something went wrong', details: err.message });
  }
});

app.listen(3000, () => console.log('✅ Server running on port 3000'));
