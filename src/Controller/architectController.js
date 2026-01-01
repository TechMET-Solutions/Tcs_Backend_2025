// const db = require("../../Config/database");

// // ✅ CREATE ARCHITECT (AUTO CREATE TABLE + INSERT)
// exports.createArchitect = async (req, res) => {
//     try {
//         const { name, whatsapp, commission, birthdate, loyaltyPoints, remark } = req.body;

//         // ✅ Auto Create Table
//         const createTableSQL = `
//       CREATE TABLE IF NOT EXISTS architects (
//         id INT AUTO_INCREMENT PRIMARY KEY,
//         name VARCHAR(100) NOT NULL,
//         whatsapp VARCHAR(20) NOT NULL,
//         remark VARCHAR(100) NOT NULL,
//         commission INT NOT NULL,
//         birthdate DATE NOT NULL,
//         loyaltyPoints INT DEFAULT 0,
//         createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `;

//         await db.query(createTableSQL);

//         // ✅ Insert Data
//         const insertSQL = `
//       INSERT INTO architects
//       (name, whatsapp, commission, birthdate, loyaltyPoints, remark)
//       VALUES (?, ?, ?, ?, ?, ?)
//     `;

//         const [result] = await db.query(insertSQL, [
//             name,
//             whatsapp,
//             commission,
//             birthdate,
//             loyaltyPoints,
//             remark
//         ]);

//         res.status(201).json({
//             success: true,
//             message: "✅ Architect registered successfully",
//             id: result.insertId,
//         });
//     } catch (err) {
//         res.status(500).json({ success: false, error: err.message });
//     }
// };

// // ✅ GET ALL ARCHITECTS
// exports.getArchitects = async (req, res) => {
//     try {
//         const [rows] = await db.query(
//             "SELECT * FROM architects ORDER BY id DESC"
//         );

//         res.json({ success: true, architects: rows });
//     } catch (err) {
//         res.status(500).json({ success: false, error: err.message });
//     }
// };

const db = require("../../Config/database");

// ✅ CREATE ARCHITECT (AUTO CREATE TABLE + INSERT)
exports.createArchitect = async (req, res) => {
    try {
        const {
            firstname,
            lastname,
            whatsapp,
            commission,
            birthdate,
            loyaltyPoints,
            remark
        } = req.body;

        // ✅ Auto Create Table
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS architects (
                id INT AUTO_INCREMENT PRIMARY KEY,
                firstname VARCHAR(50) NOT NULL,
                lastname VARCHAR(50) NOT NULL,
                whatsapp VARCHAR(20) NOT NULL,
                remark VARCHAR(100) NOT NULL,
                commission INT NOT NULL,
                birthdate DATE NOT NULL,
                loyaltyPoints INT DEFAULT 0,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            `;

        await db.query(createTableSQL);

        // ✅ Insert Data
        const insertSQL = `
            INSERT INTO architects 
            (firstname, lastname, whatsapp, commission, birthdate, loyaltyPoints, remark)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.query(insertSQL, [
            firstname,
            lastname,
            whatsapp,
            commission,
            birthdate,
            loyaltyPoints,
            remark
        ]);

        res.status(201).json({
            success: true,
            message: "✅ Architect registered successfully",
            id: result.insertId,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};


// ✅ GET ALL ARCHITECTS
exports.getArchitects = async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT * FROM architects ORDER BY id DESC"
        );

        res.json({ success: true, architects: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};



// ✅ UPDATE ARCHITECT
exports.updateArchitect = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            firstname,
            lastname,
            whatsapp,
            commission,
            birthdate,
            loyaltyPoints,
            remark
        } = req.body;

        const updateSQL = `
            UPDATE architects SET
                firstname = ?,
                lastname = ?,
                whatsapp = ?,
                commission = ?,
                birthdate = ?,
                loyaltyPoints = ?,
                remark = ?
            WHERE id = ?
        `;

        const [result] = await db.query(updateSQL, [
            firstname,
            lastname,
            whatsapp,
            commission,
            birthdate,
            loyaltyPoints,
            remark,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "❌ Architect not found"
            });
        }

        res.json({
            success: true,
            message: "✅ Architect updated successfully"
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};



// ✅ DELETE ARCHITECT
exports.deleteArchitect = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query(
            "DELETE FROM architects WHERE id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "❌ Architect not found"
            });
        }

        res.json({
            success: true,
            message: "🗑️ Architect deleted successfully"
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
