const db = require("../../Config/database");

// 🔹 Generate Automatic Bill Number
const generateBillNo = () => {
    return "BILL-" + Math.floor(100000 + Math.random() * 900000);
};

// ✅ ADD PURCHASE (FINAL PERFECT CODE)
exports.addPurchase = async (req, res) => {
    const { purchaseDate, billNo, clientName, clientContact, items, subTotal } = req.body;

    try {
        const finalBill = billNo && billNo.trim() !== "" ? billNo : generateBillNo();

        // 1️⃣ INSERT PURCHASE
        const [purchaseResult] = await db.query(
            `INSERT INTO purchases (bill_no, purchase_date, client_name, client_contact, subtotal)
             VALUES (?, ?, ?, ?, ?)`,
            [finalBill, purchaseDate, clientName, clientContact, subTotal]
        );

        const purchaseId = purchaseResult.insertId;

        // 2️⃣ LOOP ITEMS
        for (const item of items) {
            if (!item.productId || !item.qty || !item.batchNo) continue;

            // INSERT PURCHASE ITEMS
            await db.query(
                `INSERT INTO purchase_items 
                 (purchase_id, product_id, batch_no, qty, rate, cov, total, godown)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    purchaseId,
                    item.productId,
                    item.batchNo,
                    Number(item.qty),
                    Number(item.rate),
                    Number(item.cov),
                    Number(item.total),
                    item.godown
                ]
            );

            // 3️⃣ STOCK UPDATE (DO NOT CHANGE LOCATION)
            const [existingBatch] = await db.query(
                `SELECT qty, location FROM product_batches 
                 WHERE product_id = ? AND batch_no = ?`,
                [item.productId, item.batchNo]
            );

            if (existingBatch.length > 0) {
                // ➕ Update only qty — location remains SAME
                await db.query(
                    `UPDATE product_batches 
                     SET qty = qty + ?
                     WHERE product_id = ? AND batch_no = ?`,
                    [
                        Number(item.qty),
                        item.productId,
                        item.batchNo
                    ]
                );

            } else {
                // 🔹 New batch → insert with godown location
                await db.query(
                    `INSERT INTO product_batches 
                     (product_id, batch_no, qty)
                     VALUES (?, ?, ?, ?)`,
                    [
                        item.productId,
                        item.batchNo,
                        Number(item.qty),
                       
                    ]
                );
            }
        }

        res.json({
            success: true,
            message: "Purchase Added Successfully",
            billNo: finalBill,
            purchaseId
        });

    } catch (error) {
        console.log("❌ Purchase Error:", error);
        res.status(500).json({ success: false, error: "Server Error" });
    }
};


// ✅ GET ALL PURCHASES + ITEMS
exports.getAllPurchases = async (req, res) => {
    try {
        const [purchases] = await db.query(
            `SELECT * FROM purchases ORDER BY id DESC`
        );

        for (let purchase of purchases) {
            const [items] = await db.query(
                `SELECT id, product_id, batch_no, qty, rate, cov, total, godown
                 FROM purchase_items
                 WHERE purchase_id = ?`,
                [purchase.id]
            );

            purchase.items = items;
        }

        res.json({ success: true, purchases });

    } catch (err) {
        console.log("❌ Get Purchase Error:", err);
        res.status(500).json({
            success: false,
            error: "Failed to fetch purchase data"
        });
    }
};


// ✅ GET SINGLE PURCHASE + ITEMS
exports.getSinglePurchase = async (req, res) => {
    const { id } = req.params;

    try {
        const [[purchase]] = await db.query(
            `SELECT * FROM purchases WHERE id = ?`,
            [id]
        );

        if (!purchase) {
            return res.status(404).json({
                success: false,
                message: "Purchase not found"
            });
        }

        const [items] = await db.query(
            `SELECT * FROM purchase_items WHERE purchase_id = ?`,
            [id]
        );

        purchase.items = items;

        res.json({ success: true, purchase });

    } catch (err) {
        console.log("❌ Single Purchase Error:", err);
        res.status(500).json({
            success: false,
            error: "Server Error"
        });
    }
};
