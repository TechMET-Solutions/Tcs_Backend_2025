const express = require("express");
const router = express.Router();

const {
    createCategory,
    getCategories,
    updateCategory,
    deleteCategory,
} = require("../Controller/categoryController");

// ✅ Category Routes
router.post("/create", createCategory);
router.get("/list", getCategories);
router.put("/update/:id", updateCategory);
router.delete("/delete/:id", deleteCategory);

module.exports = router;
