const db = require("../../Config/database");

// ✅ CREATE BRAND (AUTO CREATE TABLE + INSERT)
exports.createBrand = async (req, res) => {
    try {
        const { name, status } = req.body;

        // ✅ Auto-create table
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS brands (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        status ENUM('Available', 'Unavailable') DEFAULT 'Available',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

        await db.query(createTableSQL);

        // ✅ Insert brand
        const insertSQL = `
      INSERT INTO brands (name, status)
      VALUES (?, ?)
    `;

        const [result] = await db.query(insertSQL, [name, status]);

        res.status(201).json({
            success: true,
            message: "✅ Brand added successfully",
            id: result.insertId,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ GET ALL BRANDS
exports.getBrands = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM brands ORDER BY id DESC"
        );

        res.json({
            success: true,
            brands: rows,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ UPDATE BRAND
exports.updateBrand = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;

        const sql = `
      UPDATE brands 
      SET name = ?, status = ?
      WHERE id = ?
    `;

        await db.query(sql, [name, status, id]);

        res.json({
            success: true,
            message: "✅ Brand updated successfully",
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ DELETE BRAND
exports.deleteBrand = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query("DELETE FROM brands WHERE id = ?", [id]);

        res.json({
            success: true,
            message: "✅ Brand deleted successfully",
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};
