const db = require("../../Config/database"); // Your database connection

// --- 1. INITIALIZATION: Create table first ---
const ensureTableExists = async () => {
    try {
        // 1. REMOVE THE OLD CONSTRAINT FIRST (This fixes your current error)
        // We use try/catch inside because it might fail if the constraint is already gone
        try {
            await db.query("ALTER TABLE tasks DROP FOREIGN KEY tasks_ibfk_1");
            console.log("⚠️ Old foreign key 'tasks_ibfk_1' removed.");
        } catch (e) { /* Constraint already gone, ignore error */ }

        try {
            await db.query("ALTER TABLE tasks DROP COLUMN employee_id");
            console.log("⚠️ Old column 'employee_id' removed.");
        } catch (e) { /* Column already gone, ignore error */ }

        // 2. NOW DEFINE THE NEW TABLE STRUCTURE
        const tableQuery = `
        CREATE TABLE IF NOT EXISTS tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            section VARCHAR(100),
            role ENUM('admin', 'superadmin', 'user') NOT NULL,
            status ENUM('pending', 'done') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`;

        await db.query(tableQuery);

        // 3. Helper to sync missing columns
        const addColumnIfMissing = async (columnName, definition) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM tasks LIKE '${columnName}'`);
            if (rows.length === 0) {
                await db.query(`ALTER TABLE tasks ADD COLUMN ${columnName} ${definition}`);
                console.log(`✅ Added missing column: ${columnName}`);
            }
        };

        await addColumnIfMissing('user_id', 'INT NOT NULL AFTER id');
        await addColumnIfMissing('section', 'VARCHAR(100) AFTER title');
        await addColumnIfMissing('role', "ENUM('admin', 'superadmin', 'user') NOT NULL AFTER section");

        console.log("✅ Database Sync: 'tasks' table is fully cleaned and updated.");
    } catch (err) {
        console.error("❌ Database Sync Error:", err.message);
    }
};

// Run the sync immediately
ensureTableExists();

// --- 2. CONTROLLER LOGIC ---

// POST: Create and store new task
exports.createTask = async (req, res) => {
    const { title, section, userId, role } = req.body;

    if (!title || !role || !userId) {
        return res.status(400).send({ message: "Missing required fields (title, role, or userId)" });
    }

    const insertQuery = `
        INSERT INTO tasks (title, section, user_id, role, status) 
        VALUES (?, ?, ?, ?, 'pending')
    `;

    try {
        const [result] = await db.execute(insertQuery, [title, section, userId, role]);
        res.status(201).send({
            message: "Task created successfully",
            taskId: result.insertId
        });
    } catch (err) {
        res.status(500).send({ message: "Error saving task", error: err.message });
    }
};

// GET: Fetch tasks for Admin/Superadmin
exports.getTasksByRole = async (req, res) => {
    const { role, section } = req.query;
    console.log(role, section);
    if (role !== 'admin' && role !== 'superadmin') {
        return res.status(403).send({ message: "Access Denied" });
    }

    const selectQuery = `
        SELECT * FROM tasks 
        WHERE role = ? AND section = ? 
        ORDER BY created_at DESC
    `;

    try {
        const [rows] = await db.execute(selectQuery, [role, section]);
        res.status(200).send(rows);
    } catch (err) {
        res.status(500).send({ message: "Error retrieving tasks", error: err.message });
    }
};

// DELETE: Remove task
exports.deleteTask = async (req, res) => {
    const id = req.params.id;
    const deleteQuery = `DELETE FROM tasks WHERE id = ?`;

    try {
        const [result] = await db.execute(deleteQuery, [id]);
        if (result.affectedRows > 0) {
            res.send({ message: "Task deleted successfully!" });
        } else {
            res.status(404).send({ message: "Task not found." });
        }
    } catch (err) {
        res.status(500).send({ message: "Could not delete Task" });
    }
};