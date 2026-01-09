const db = require("../../Config/database");

// --- INITIALIZATION: Create table first ---
const ensureTableExists = async () => {
    const tableQuery = `
    CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status ENUM('pending', 'done') DEFAULT 'pending',
        remark TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );`;

    try {
        await db.execute(tableQuery);
        console.log("✅ Database Sync: 'tasks' table is ready.");
    } catch (err) {
        console.error("❌ Database Sync Error:", err.message);
        throw err; // Stop execution if table creation fails
    }
};
// 1. Admin creates a task (ADD DATA)
exports.createTask = async (req, res) => {
    try {
        const { employeeId, title, description } = req.body;
        await ensureTableExists();
        if (!employeeId || !title) {
            return res.status(400).json({ success: false, message: "Missing fields" });
        }

        // Insert task (Database handles default status 'pending')
        const query = "INSERT INTO tasks (employee_id, title, description) VALUES (?, ?, ?)";
        const [result] = await db.execute(query, [employeeId, title, description]);

        // Immediately fetch the task we just created to show in the UI
        const fetchNewTask = `
      SELECT tasks.*, employees.name as empName 
      FROM tasks 
      JOIN employees ON tasks.employee_id = employees.id 
      WHERE tasks.id = ?`;
        const [rows] = await db.execute(fetchNewTask, [result.insertId]);

        res.status(201).json({
            success: true,
            message: "Task assigned successfully",
            task: rows[0]
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// 2. Employee Updates (Add Remark & Change Status)
exports.updateTaskStatus = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status, remark } = req.body;

        // MANDATORY REMARK CHECK
        if (!remark || remark.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "A remark is mandatory before completing a task"
            });
        }

        const query = "UPDATE tasks SET status = ?, remark = ? WHERE id = ?";
        await db.execute(query, [status, remark, taskId]);

        res.json({ success: true, message: "Task status and remark updated" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


exports.getAllTasks = async (req, res) => {
    try {
        const query = `
            SELECT tasks.*, employees.name as empName, employees.profile_photo 
            FROM tasks 
            JOIN employees ON tasks.employee_id = employees.id 
            ORDER BY tasks.created_at DESC`;

        const [rows] = await db.execute(query);

        // Manually build the profile_url for the frontend
        const updatedTasks = rows.map(task => ({
            ...task,
            profile_url: task.profile_photo
                ? `http://localhost:5000/uploads/employees/${task.profile_photo}`
                : null
        }));

        res.json({ success: true, tasks: updatedTasks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// --- 3. EMPLOYEE: GET MY TASKS ---
// Shows only tasks assigned to the specific logged-in employee
exports.getEmployeeTasks = async (req, res) => {
    try {
        const { employeeId } = req.params; // or get from req.user if using JWT auth

        const query = `SELECT * FROM tasks WHERE employee_id = ? ORDER BY created_at DESC`;
        const [rows] = await db.execute(query, [employeeId]);

        res.json({ success: true, tasks: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const { taskId } = req.params;

        const query = "DELETE FROM tasks WHERE id = ?";
        const [result] = await db.execute(query, [taskId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }

        res.json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
