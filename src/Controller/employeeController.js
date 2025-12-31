const db = require("../../Config/database");
const jwt = require("jsonwebtoken");
const fs = require("fs");

// Helper to ensure table exists with document columns
const ensureEmployeesTable = async () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS employees (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(100) NOT NULL,
            phone VARCHAR(15),
            commission DECIMAL(5,2) DEFAULT 0,
            birthdate DATE,
            salary DECIMAL(10,2) DEFAULT 0,
            expense DECIMAL(10,2) DEFAULT 0,
            advance DECIMAL(10,2) DEFAULT 0,
            aadhar_photo VARCHAR(255),
            pancard_photo VARCHAR(255),
            status ENUM('active', 'blocked') DEFAULT 'active',
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await db.query(sql);
};

// CREATE
exports.createEmployee = async (req, res) => {
    try {
        await ensureEmployeesTable();
        const { name, email, password, phone, commission, birthdate, salary, expense, advance } = req.body;

        const aadhar = req.files?.aadhar ? req.files.aadhar[0].filename : null;
        const pancard = req.files?.pancard ? req.files.pancard[0].filename : null;

        const sql = `INSERT INTO employees (name, email, password, phone, commission, birthdate, salary, expense, advance, aadhar_photo, pancard_photo) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
        await db.query(sql, [name, email, password, phone, commission || 0, birthdate, salary || 0, expense || 0, advance || 0, aadhar, pancard]);

        res.status(201).json({ success: true, message: "Employee added successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// UPDATE (Handles both text and optional new files)
exports.updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, commission, birthdate, salary, expense, advance } = req.body;

        // Check for new files
        let updateSql = `UPDATE employees SET name=?, email=?, phone=?, commission=?, birthdate=?, salary=?, expense=?, advance=?`;
        let params = [name, email, phone, commission, birthdate, salary, expense, advance];

        if (req.files?.aadhar) {
            updateSql += `, aadhar_photo=?`;
            params.push(req.files.aadhar[0].filename);
        }
        if (req.files?.pancard) {
            updateSql += `, pancard_photo=?`;
            params.push(req.files.pancard[0].filename);
        }

        updateSql += ` WHERE id=?`;
        params.push(id);

        await db.query(updateSql, params);
        res.json({ success: true, message: "Employee updated successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// DELETE
exports.deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM employees WHERE id = ?", [id]);
        res.json({ success: true, message: "Employee deleted" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// TOGGLE STATUS (Block/Unblock)
exports.toggleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Expecting 'active' or 'blocked'
        await db.query("UPDATE employees SET status = ? WHERE id = ?", [status, id]);
        res.json({ success: true, message: `Employee ${status}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET LIST
exports.getEmployees = async (req, res) => {
    try {
        // Construct the base URL dynamically based on the current server host
        const imageBaseUrl = `${req.protocol}://${req.get('host')}/uploads/employees/`;

        const [rows] = await db.query("SELECT * FROM employees ORDER BY id DESC");

        // Map through the rows to add the base URL to the filenames
        const employeesWithImages = rows.map(emp => ({
            ...emp,
            // Attach full URLs for the frontend to use directly
            aadhar_url: emp.aadhar_photo ? `${imageBaseUrl}${emp.aadhar_photo}` : null,
            pancard_url: emp.pancard_photo ? `${imageBaseUrl}${emp.pancard_photo}` : null
        }));

        res.json({
            success: true,
            imageBaseUrl, // Also sending separately just in case
            employees: employeesWithImages
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};