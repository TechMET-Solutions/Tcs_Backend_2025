const db = require("../../Config/database");

/**
 * Ensure tracking_logs table exists
 */
const ensureTablesExist = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS tracking_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            challan_id VARCHAR(50) NOT NULL,
            status VARCHAR(100) NOT NULL,
            tracked_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await db.query(query);
};

/**
 * Get tracking list by challan ID
 */
exports.getTrackingByChallan = async (req, res) => {
    try {
        const { challanId } = req.params;

        const [results] = await db.query(
            "SELECT * FROM tracking_logs WHERE challan_id = ? ORDER BY tracked_at DESC",
            [challanId]
        );

        res.json(results);
    } catch (err) {
        res.status(500).json(err);
    }
};

/**
 * Add tracking status
 */
exports.addTracking = async (req, res) => {
    try {
        const { challanId, status, trackedAt } = req.body;

        console.log("TRACKING PAYLOAD:", req.body);


        // 🔐 Validation (prevents 500 errors)
        if (!challanId || !status || !trackedAt) {
            return res.status(400).json({
                success: false,
                message: "challanId, status and trackedAt are required"
            });
        }

        // 🕒 Convert to MySQL-compatible datetime
        const formattedDate = new Date(trackedAt)
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");

        // Ensure table exists
        await ensureTablesExist();

        const [result] = await db.query(
            `INSERT INTO tracking_logs (challan_id, status, tracked_at)
       VALUES (?, ?, ?)`,
            [challanId, status, formattedDate]
        );

        res.status(201).json({
            success: true,
            message: "Tracking added",
            id: result.insertId
        });

    } catch (err) {
        console.error("ADD TRACKING ERROR:", err);

        res.status(500).json({
            success: false,
            message: "Failed to add tracking",
            error: err.sqlMessage || err.message
        });
    }
};

/**
 * Delete tracking step
 */
exports.deleteTracking = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query(
            "DELETE FROM tracking_logs WHERE id = ?",
            [id]
        );

        res.json({ message: "Tracking deleted" });
    } catch (err) {
        res.status(500).json(err);
    }
};
