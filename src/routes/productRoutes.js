const express = require("express");
const router = express.Router();
const upload = require("../../Config/multer");

const {
    addProduct,
    getProducts
} = require("../Controller/productController");

router.post("/add", upload.single("image"), addProduct);
router.get("/list", getProducts);

module.exports = router;
