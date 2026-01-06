const db = require("../../Config/database");

/* ---------------- CREATE SUPPLIER ---------------- */
exports.createSupplier = async (req, res) => {
    try {
        const { name, mobile } = req.body;

        if (!name || !mobile) {
            return res.status(400).json({
                success: false,
                message: "Name and mobile are required",
            });
        }

        // Ensure table exists
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS suppliers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                mobile VARCHAR(15) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `;
        await db.query(createTableSQL);

        const insertSQL =
            "INSERT INTO suppliers (name, mobile) VALUES (?, ?)";
        const [result] = await db.query(insertSQL, [name, mobile]);

        return res.status(201).json({
            success: true,
            message: "Supplier created successfully",
            supplierId: result.insertId,
        });
    } catch (error) {
        console.error("Create Supplier Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/* ---------------- GET SUPPLIERS (PAGINATION) ---------------- */
exports.getSuppliers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const countSql = "SELECT COUNT(*) AS total FROM suppliers";
        const dataSql =
            "SELECT * FROM suppliers ORDER BY id DESC LIMIT ? OFFSET ?";

        const [[countResult]] = await db.query(countSql);
        const total = countResult.total;
        const totalPages = Math.ceil(total / limit);

        const [suppliers] = await db.query(dataSql, [limit, offset]);

        res.json({
            success: true,
            suppliers,
            pagination: {
                total,
                totalPages,
                currentPage: page,
                limit,
            },
        });
    } catch (error) {
        console.error("Get Suppliers Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/* ---------------- UPDATE SUPPLIER ---------------- */
exports.updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, mobile } = req.body;

        if (!name || !mobile) {
            return res.status(400).json({
                success: false,
                message: "Name and mobile are required",
            });
        }

        const sql =
            "UPDATE suppliers SET name = ?, mobile = ? WHERE id = ?";
        const [result] = await db.query(sql, [name, mobile, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found",
            });
        }

        res.json({
            success: true,
            message: "Supplier updated successfully",
        });
    } catch (error) {
        console.error("Update Supplier Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

/* ---------------- DELETE SUPPLIER ---------------- */
exports.deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;

        const sql = "DELETE FROM suppliers WHERE id = ?";
        const [result] = await db.query(sql, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Supplier not found",
            });
        }

        res.json({
            success: true,
            message: "Supplier deleted successfully",
        });
    } catch (error) {
        console.error("Delete Supplier Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
