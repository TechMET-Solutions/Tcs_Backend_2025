const express = require("express");
const router = express.Router();
const Purchase = require("../Controller/purchaseController");

router.post("/add", Purchase.addPurchase);
router.put("/update", Purchase.updatePurchase);
router.get("/list", Purchase.getAllPurchases);
router.get("/purchase/:id", Purchase.getSinglePurchase);

module.exports = router;
