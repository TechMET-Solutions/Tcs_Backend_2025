// Routes/quotationRoutes.js

const express = require("express");
const router = express.Router();
const { saveQuotation, getAllQuotationsFull, printQuotation, generateDeliveryChallan, getAllDeliveryChallan, printDeliveryChallan } = require("../Controller/quotationController");

router.post("/saveQuotation", saveQuotation);
router.get("/list", getAllQuotationsFull);
router.get("/print/:id", printQuotation);
router.post("/generate-dc", generateDeliveryChallan);
router.get("/delivery-challan/list", getAllDeliveryChallan);
router.get("/delivery-challan/print/:challanId", printDeliveryChallan);

module.exports = router;
