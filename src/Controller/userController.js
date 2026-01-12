const db = require("../../Config/database");

// ✅ CREATE CUSTOMER (AUTO CREATE TABLE + INSERT) ✅ PROMISE SAFE
exports.createCustomer = async (req, res) => {
    try {
        const {
            name, Last_Name, phone, altphone, email, billingName,
            assignedEmployee, assignedArchitect, status, notes,
            projectName, siteName, siteType, priority
        } = req.body;

        // 1️⃣ Ensure Table Exists
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) DEFAULT NULL,
                Last_Name VARCHAR(100) DEFAULT NULL,
                phone VARCHAR(20) DEFAULT NULL,
                altphone VARCHAR(20) DEFAULT NULL,
                email VARCHAR(100) DEFAULT NULL,
                billingName VARCHAR(100) DEFAULT NULL,
                assignedEmployee VARCHAR(100) DEFAULT NULL,
                assignedArchitect VARCHAR(100) DEFAULT NULL,
                status VARCHAR(50) DEFAULT NULL,
                notes TEXT DEFAULT NULL,
                projectName VARCHAR(255) DEFAULT NULL,
                siteName VARCHAR(255) DEFAULT NULL,
                siteType VARCHAR(100) DEFAULT NULL,
                priority VARCHAR(50) DEFAULT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `;
        await db.query(createTableSQL);

        // 2️⃣ CHECK IF CUSTOMER EXISTS (By Phone Number)
        // We check if the phone number is already in the database
        if (phone) {
            const checkSQL = `SELECT id FROM customers WHERE phone = ? LIMIT 1`;
            const [existing] = await db.query(checkSQL, [phone]);

            if (existing.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `❌ A customer with phone number ${phone} already exists.`
                });
            }
        }

        // 3️⃣ INSERT DATA (Since no duplicate was found)
        const insertSQL = `
            INSERT INTO customers 
            (name, Last_Name, phone, altphone, email, billingName, assignedEmployee, assignedArchitect, status, notes, projectName, siteName, siteType, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.query(insertSQL, [
            name || null,
            Last_Name || null,
            phone || null,
            altphone || null,
            email || null,
            billingName || null,
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
            customerId: result.insertId
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

// ✅ GET ALL CUSTOMERS WITH PAGINATION
// exports.getCustomers = async (req, res) => {
//     try {
//         const page = parseInt(req.query.page) || 1;
//         const limit = parseInt(req.query.limit) || 10;
//         const offset = (page - 1) * limit;

//         // Get total count for pagination UI
//         const [countResult] = await db.query("SELECT COUNT(*) as total FROM customers");
//         const total = countResult[0].total;

//         // Get paginated data
//         const [result] = await db.query(
//             "SELECT * FROM customers ORDER BY id DESC LIMIT ? OFFSET ?",
//             [limit, offset]
//         );

//         res.json({
//             success: true,
//             customers: result,
//             pagination: {
//                 total,
//                 page,
//                 limit,
//                 totalPages: Math.ceil(total / limit)
//             }
//         });
//     } catch (err) {
//         res.status(500).json({ success: false, error: err.message });
//     }
// };
exports.getCustomers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // 1. Get total count
        const [countResult] = await db.query("SELECT COUNT(*) as total FROM customers");
        const total = countResult[0].total;

        // 2. Get paginated data with Custom Priority Sorting
        // FIELD() returns the index of the value in the list provided.
        // We sort by that index, then by id DESC for items with the same priority.
        const [result] = await db.query(
            `SELECT * FROM customers 
             ORDER BY FIELD(priority, 'URGENT', 'HIGH', 'MEDIUM', 'LOW'), id DESC 
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        res.json({
            success: true,
            customers: result,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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


exports.updateCustomer = async (req, res) => {
    try {
        const { id } = req.params; // Get ID from URL
        const {
            name, Last_Name, phone, altphone, email, billingName,
            assignedEmployee, assignedArchitect,
            status, notes, projectName,
            siteName, siteType, priority
        } = req.body;

        const updateSQL = `
            UPDATE customers 
            SET 
                name = ?, Last_Name = ?, phone = ?, altphone = ?, email = ?, billingName = ?,
                assignedEmployee = ?, assignedArchitect = ?, 
                status = ?, notes = ?, projectName = ?, 
                siteName = ?, siteType = ?, priority = ?
            WHERE id = ?
        `;

        const [result] = await db.query(updateSQL, [
            name || null,
            Last_Name || null,
            phone || null,
            altphone || null,
            email || null,
            billingName || null,
            assignedEmployee || null,
            assignedArchitect || null,
            status || 'New',
            notes || null,
            projectName || null,
            siteName || null,
            siteType || null,
            priority || 'Low',
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        res.json({
            success: true,
            message: "✅ Customer updated successfully",
            data: { id, name, projectName }
        });

    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to update customer",
            error: err.message,
        });
    }
};