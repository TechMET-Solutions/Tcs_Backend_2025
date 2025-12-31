const express = require("express");
const router = express.Router();
const upload = require("../../Config/multer");

const {
    addProduct,
    getProducts,
    updateProduct
} = require("../Controller/productController");

router.post("/add", upload.single("image"), addProduct);
router.get("/list", getProducts);
router.put("/products/:id", upload.single("image"), updateProduct);

module.exports = router;
