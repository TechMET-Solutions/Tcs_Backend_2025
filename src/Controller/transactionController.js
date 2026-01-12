const db = require('../../Config/database');

exports.createTransaction = async (req, res) => {
    try {
        const { name, amount, type, remark } = req.body;
        const date = new Date().toISOString().split('T')[0];

        // 1. STEP ONE: Create Table if it doesn't exist
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                amount DECIMAL(15, 2) NOT NULL,
                type ENUM('credit', 'debit') NOT NULL,
                remark TEXT,
                date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.execute(createTableQuery);

        // 2. STEP TWO: Insert the data
        const insertQuery = `
            INSERT INTO transactions (name, amount, type, remark, date) 
            VALUES (?, ?, ?, ?, ?)
        `;

        const [result] = await db.execute(insertQuery, [
            name,
            Number(amount),
            type,
            remark || "",
            date
        ]);

        res.status(201).json({
            success: true,
            message: "Table verified and data added!",
            id: result.insertId
        });

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ error: error.message });
    }
};

// Fetching data
exports.getAllTransactions = async (req, res) => {
    try {
        // We also add the create check here in case the first request is a GET
        await db.execute(`CREATE TABLE IF NOT EXISTS transactions (
            id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), amount DECIMAL(15,2), 
            type ENUM('credit','debit'), remark TEXT, date DATE
        )`);

        const [rows] = await db.execute("SELECT * FROM transactions ORDER BY id DESC");
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};