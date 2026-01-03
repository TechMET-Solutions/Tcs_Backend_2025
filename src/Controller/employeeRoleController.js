const db = require("../../Config/database");

// Helper function to ensure table exists
const ensureTableExists = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS employee_permissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL UNIQUE,
            permissions JSON NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    `;
    await db.execute(createTableQuery);
};

// Fetch permissions for a single employee
exports.getEmployeePermissions = async (req, res) => {
    const { id } = req.params;
    try {
        // Optional: Ensure table exists even on GET requests
        await ensureTableExists();

        const [rows] = await db.execute(
            "SELECT permissions FROM employee_permissions WHERE employee_id = ?",
            [id]
        );

        const permissions = rows.length > 0 ? rows[0].permissions : {};

        res.status(200).json({
            success: true,
            permissions: typeof permissions === 'string' ? JSON.parse(permissions) : permissions,
        });
    } catch (error) {
        console.error("Error fetching permissions:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Save or Update permissions
exports.saveEmployeePermissions = async (req, res) => {
    const { employeeId, permissions } = req.body;

    if (!employeeId) {
        return res.status(400).json({ success: false, message: "Employee ID is required" });
    }

    try {
        // FIRST: Create table if it doesn't exist
        await ensureTableExists();

        // SECOND: Insert or Update the data
        const sql = `
            INSERT INTO employee_permissions (employee_id, permissions) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE permissions = VALUES(permissions)
        `;

        const permissionsStr = JSON.stringify(permissions);
        await db.execute(sql, [employeeId, permissionsStr]);

        res.status(200).json({
            success: true,
            message: "Permissions updated successfully",
        });
    } catch (error) {
        console.error("Error saving permissions:", error);
        res.status(500).json({ success: false, message: "Failed to save permissions" });
    }
};