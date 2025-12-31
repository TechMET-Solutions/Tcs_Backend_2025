const db = require("../../Config/database");

// ✅ CREATE CUSTOMER (AUTO CREATE TABLE + INSERT) ✅ PROMISE SAFE
exports.createCustomer = async (req, res) => {
    try {
        // 1️⃣ Destructure all fields from your frontend payload
        const {
            name,
            Last_Name,
            phone,
            email,
            assignedEmployee,
            assignedArchitect,
            status,
            notes,
            projectName,
            siteName,
            siteType,
            priority
        } = req.body;

        // 2️⃣ AUTO CREATE/UPDATE TABLE (Ensuring all new columns exist)
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                Last_Name VARCHAR(100),
                phone VARCHAR(20) NOT NULL,
                email VARCHAR(100),
                assignedEmployee VARCHAR(100),
                assignedArchitect VARCHAR(100),
                status VARCHAR(50) DEFAULT 'New',
                notes TEXT,
                projectName VARCHAR(255),
                siteName VARCHAR(255),
                siteType VARCHAR(100),
                priority VARCHAR(50) DEFAULT 'Low',
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `;

        await db.query(createTableSQL);

        // 3️⃣ INSERT DATA (Matching your specific payload)
        const insertSQL = `
            INSERT INTO customers 
            (name, Last_Name, phone, email, assignedEmployee, assignedArchitect, status, notes, projectName, siteName, siteType, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.query(insertSQL, [
            name || null,
            Last_Name || null,
            phone || null,
            email || null,
            assignedEmployee || null,
            assignedArchitect || null,
            status || 'New',
            notes || null,
            projectName || null,
            siteName || null,
            siteType || null,
            priority || 'Low'
        ]);

        // 4️⃣ SUCCESS RESPONSE
        res.status(201).json({
            success: true,
            message: "✅ Customer record created successfully",
            customerId: result.insertId,
            data: { name, projectName }
        });

    } catch (err) {
        console.error("CRM Error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to create customer record",
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