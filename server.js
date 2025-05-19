const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Load environment variables
const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET
} = process.env;

// Configure Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

// Route to test upload
app.post('/upload-image', async (req, res) => {
  const { base64Image } = req.body;

  if (!base64Image || !base64Image.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image format or missing data' });
  }

  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'test_uploads'
    });

    res.json({
      success: true,
      imageUrl: result.secure_url
    });
  } catch (err) {
    console.error('Cloudinary upload error:', err.message);
    res.status(500).json({ error: 'Failed to upload image', details: err.message });
  }
});

app.listen(3000, () => console.log('✅ Image upload server running on port 3000'));
