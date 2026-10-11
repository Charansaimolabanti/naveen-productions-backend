const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(file, folder, publicIdBase) {
  if (!file) return null;

  const dataURI = `data:${file.mimetype};base64,${Buffer.from(file.buffer).toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataURI, {
    folder: `naveen-productions/${folder}`,
    public_id: `${publicIdBase}-${Date.now()}`,
    resource_type: 'image',
    transformation: [
      { width: 1920, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'webp' },
    ],
  });

  return result.secure_url;
}

module.exports = cloudinary;
module.exports.uploadToCloudinary = uploadToCloudinary;