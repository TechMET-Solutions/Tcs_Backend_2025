const db = require("../../Config/database");

// ✅ CREATE CATEGORY (AUTO CREATE TABLE + INSERT)
exports.createCategory = async (req, res) => {
    try {
        const { name, status } = req.body;

        // ✅ Auto-create table
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        status ENUM('Available', 'Unavailable') DEFAULT 'Available',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

        await db.query(createTableSQL);

        // ✅ Insert category
        const insertSQL = `
      INSERT INTO categories (name, status)
      VALUES (?, ?)
    `;

        const [result] = await db.query(insertSQL, [name, status]);

        res.status(201).json({
            success: true,
            message: "✅ Category added successfully",
            id: result.insertId,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ GET ALL CATEGORIES
exports.getCategories = async (req, res) => {
    try {
        // 1. Extract pagination parameters (Default: Page 1, Limit 10)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // 2. Get total count for the frontend to calculate total pages
        const [countResult] = await db.query("SELECT COUNT(*) as total FROM categories");
        const totalItems = countResult[0].total;

        // 3. Fetch only the required rows
        const [rows] = await db.query(
            "SELECT * FROM categories ORDER BY id DESC LIMIT ? OFFSET ?",
            [limit, offset]
        );

        res.json({
            success: true,
            categories: rows,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
                limit
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ UPDATE CATEGORY
exports.updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;

        const sql = `
      UPDATE categories 
      SET name = ?, status = ?
      WHERE id = ?
    `;

        await db.query(sql, [name, status, id]);

        res.json({
            success: true,
            message: "✅ Category updated successfully",
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ DELETE CATEGORY
exports.deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query("DELETE FROM categories WHERE id = ?", [id]);

        res.json({
            success: true,
            message: "✅ Category deleted successfully",
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};
