const db = require("../../Config/database");

// ✅ CREATE CUSTOMER (AUTO CREATE TABLE + INSERT) ✅ PROMISE SAFE
exports.createCustomer = async (req, res) => {
    try {
        const {
            name,
            phone,
            email,
            assignedEmployee,
            assignedArchitect,
            status,
            nextFollowup,
            followupResponse,
            notes,
        } = req.body;

        // ✅ 1️⃣ AUTO CREATE TABLE
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(100),
        assignedEmployee VARCHAR(100),
        assignedArchitect VARCHAR(100),
        status VARCHAR(50),
        nextFollowup DATE,
        followupResponse TEXT,
        notes TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

        await db.query(createTableSQL);

        // ✅ 2️⃣ INSERT DATA
        const insertSQL = `
      INSERT INTO customers 
      (name, phone, email, assignedEmployee, assignedArchitect, status, nextFollowup, followupResponse, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const [result] = await db.query(insertSQL, [
            name,
            phone,
            email,
            assignedEmployee,
            assignedArchitect,
            status,
            nextFollowup,
            followupResponse,
            notes,
        ]);

        res.status(201).json({
            success: true,
            message: "✅ Customer added successfully",
            id: result.insertId,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Database error",
            error: err.message,
        });
    }
};

// ✅ GET ALL CUSTOMERS ✅ PROMISE SAFE
exports.getCustomers = async (req, res) => {
    try {
        const [result] = await db.query(
            "SELECT * FROM customers ORDER BY id DESC"
        );

        res.json({ success: true, customers: result });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ ADD FOLLOWUP ✅ PROMISE SAFE
exports.addFollowup = async (req, res) => {
    try {
        const { customerId, date, response } = req.body;

        // ✅ AUTO CREATE FOLLOWUPS TABLE
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS followups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customerId INT NOT NULL,
        date DATE NOT NULL,
        response TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

        await db.query(createTableSQL);

        // ✅ INSERT FOLLOWUP
        const insertSQL = `
      INSERT INTO followups (customerId, date, response)
      VALUES (?, ?, ?)
    `;

        await db.query(insertSQL, [customerId, date, response]);

        res.json({
            success: true,
            message: "✅ Follow-up added successfully",
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

// ✅ GET FOLLOWUP HISTORY ✅ PROMISE SAFE
exports.getFollowups = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(
            "SELECT * FROM followups WHERE customerId = ? ORDER BY id DESC",
            [id]
        );

        res.json({ success: true, followups: result });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};