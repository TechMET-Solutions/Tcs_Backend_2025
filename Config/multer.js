const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 👉 Upload folder INSIDE BACKEND
const uploadPath = path.join(__dirname, "..", "uploads");

// 👉 Auto-create folder if missing
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}

// 👉 Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + "-" + file.originalname;
        cb(null, uniqueName);
    },
});

// 👉 File validation
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (ext) cb(null, true);
    else cb(new Error("Only image files allowed"));
};

module.exports = multer({ storage, fileFilter });
