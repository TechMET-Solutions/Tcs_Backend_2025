const express = require("express");
const {
    createSupplier,
    getSuppliers,
    updateSupplier,
    deleteSupplier,
} = require("../Controller/supplierController");

const router = express.Router();

router.post("/create", createSupplier);
router.get("/list", getSuppliers);
router.put("/update/:id", updateSupplier);
router.delete("/delete/:id", deleteSupplier);

module.exports = router;
