const express = require("express");
const router = express.Router();

const {
    createBrand,
    getBrands,
    updateBrand,
    deleteBrand,
} = require("../Controller/brandController");

// ✅ Brand Routes
router.post("/create", createBrand);
router.get("/list", getBrands);
router.put("/update/:id", updateBrand);
router.delete("/delete/:id", deleteBrand);

module.exports = router;
