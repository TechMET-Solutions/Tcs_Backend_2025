const db = require("../../Config/database");

// ✅ CREATE QUALITY (AUTO CREATE TABLE + INSERT)
exports.createQuality = async (req, res) => {
    try {
        const { name, status } = req.body;

        // ✅ Auto-create table
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS qualities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        status ENUM('Available', 'Unavailable') DEFAULT 'Available',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

        await db.query(createTableSQL);

        // ✅ Insert data
        const insertSQL = `
      INSERT INTO qualities (name, status)
      VALUES (?, ?)
    `;

        const [result] = await db.query(insertSQL, [name, status]);

        res.status(201).json({
            success: true,
            message: "✅ Quality added successfully",
            id: result.insertId,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ GET ALL QUALITIES
exports.getQualities = async (req, res) => {
    try {
        // 1. Get page and limit from query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // 2. Get the total count of qualities for pagination math
        const [countResult] = await db.query("SELECT COUNT(*) as total FROM qualities");
        const totalItems = countResult[0].total;

        // 3. Fetch the specific slice of data
        const [rows] = await db.query(
            "SELECT * FROM qualities ORDER BY id DESC LIMIT ? OFFSET ?",
            [limit, offset]
        );

        res.json({
            success: true,
            qualities: rows,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
                limit
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ✅ UPDATE QUALITY
exports.updateQuality = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;

        const sql = `
      UPDATE qualities 
      SET name = ?, status = ?
      WHERE id = ?
    `;

        await db.query(sql, [name, status, id]);

        res.json({
            success: true,
            message: "✅ Quality updated successfully",
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ DELETE QUALITY
exports.deleteQuality = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query("DELETE FROM qualities WHERE id = ?", [id]);

        res.json({
            success: true,
            message: "✅ Quality deleted successfully",
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};
