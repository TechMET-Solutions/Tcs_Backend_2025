// Routes/quotationRoutes.js

const express = require("express");
const router = express.Router();
const { saveQuotation, getAllQuotationsFull, printQuotation, generateDeliveryChallan, getAllDeliveryChallan, printDeliveryChallan, printDeliveryChallan2, updateQuotation, getArchitectQuotations, settleCommission, getArchitectLedger, deleteDeliveryChallan } = require("../Controller/quotationController");

router.post("/saveQuotation", saveQuotation);
router.put("/updateQuotation/:id", updateQuotation);
router.post("/settle-commission", settleCommission);
router.get("/list", getAllQuotationsFull);
router.get("/getArchitectQuotations/:architectId", getArchitectQuotations);
router.get("/getArchitectLedger/:architectId", getArchitectLedger);
router.get("/print/:id", printQuotation);
router.post("/generate-dc", generateDeliveryChallan);
router.get("/delivery-challan/list", getAllDeliveryChallan);
router.get("/delivery-challan/print/:challanId", printDeliveryChallan);
router.get("/delivery-challan/printreturn/:challanId", printDeliveryChallan2);
router.delete("/delivery-challan/delete/:challanId", deleteDeliveryChallan);
module.exports = router;
