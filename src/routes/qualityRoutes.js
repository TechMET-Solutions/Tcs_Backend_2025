const express = require("express");
const router = express.Router();

const {
    createQuality,
    getQualities,
    updateQuality,
    deleteQuality,
} = require("../Controller/qualityController");

// ✅ Routes
router.post("/create", createQuality);
router.get("/list", getQualities);
router.put("/update/:id", updateQuality);
router.delete("/delete/:id", deleteQuality);

module.exports = router;
