const db = require("../../Config/database");
const jwt = require("jsonwebtoken");
const path = require('path');
const fs = require('fs');

const canvas = require('canvas');
const faceapi = require('face-api.js');

// Required for face-api to work in Node.js
require('@tensorflow/tfjs');
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;

// 1. Helper to ensure Attendance Table and Upload Folders
const ensureSetup = async () => {
    const uploadDir = path.join(__dirname, '../../uploads/attendance');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const sql = `
        CREATE TABLE IF NOT EXISTS attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employeeId INT NOT NULL,
            punch_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status ENUM('IN', 'OUT') NOT NULL,
            captured_image VARCHAR(255), 
            is_verified BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (employeeId) REFERENCES employees(id)
        )
    `;
    await db.query(sql);
};

// 2. Load AI Models
const loadModels = async () => {
    if (modelsLoaded) return;

    // This creates an absolute path based on the project root
    const modelPath = path.resolve(__dirname, '../../models');

    // Add a check to see if the directory even exists
    if (!fs.existsSync(modelPath)) {
        throw new Error(`Model directory not found at: ${modelPath}. Please ensure the 'models' folder exists at the root.`);
    }

    try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
        modelsLoaded = true;
        console.log("✅ AI Models Loaded Successfully from:", modelPath);
    } catch (err) {
        console.error("❌ FaceAPI Load Error:", err.message);
        throw err; // Send this up to the punchAttendance catch block
    }
};
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
            profile_photo VARCHAR(255), -- ADD THIS COLUMN
            status ENUM('active', 'blocked') DEFAULT 'active',
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await db.query(sql);
};
const ensureAttendanceTable = async () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employeeId INT NOT NULL,
            punch_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status ENUM('IN', 'OUT') NOT NULL,
            captured_image VARCHAR(255), 
            is_verified BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (employeeId) REFERENCES employees(id)
        )
    `;
    await db.query(sql);
};
// CREATE
// exports.createEmployee = async (req, res) => {
//     try {
//         await ensureEmployeesTable();
//         const { name, email, password, phone, commission, birthdate, salary, expense, advance } = req.body;

//         const aadhar = req.files?.aadhar ? req.files.aadhar[0].filename : null;
//         const pancard = req.files?.pancard ? req.files.pancard[0].filename : null;

//         const sql = `INSERT INTO employees (name, email, password, phone, commission, birthdate, salary, expense, advance, aadhar_photo, pancard_photo) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
//         await db.query(sql, [name, email, password, phone, commission || 0, birthdate, salary || 0, expense || 0, advance || 0, aadhar, pancard]);

//         res.status(201).json({ success: true, message: "Employee added successfully" });
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// };
exports.createEmployee = async (req, res) => {
    try {
        await ensureEmployeesTable();
        const { name, email, password, phone, commission, birthdate, salary, expense, advance } = req.body;

        // Extract filenames from req.files
        const aadhar = req.files?.aadhar ? req.files.aadhar[0].filename : null;
        const pancard = req.files?.pancard ? req.files.pancard[0].filename : null;
        const profile = req.files?.profile ? req.files.profile[0].filename : null; // ADD THIS

        // Updated SQL with 12 placeholders
        const sql = `INSERT INTO employees 
            (name, email, password, phone, commission, birthdate, salary, expense, advance, aadhar_photo, pancard_photo, profile_photo) 
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

        await db.query(sql, [
            name, email, password, phone,
            commission || 0, birthdate, salary || 0,
            expense || 0, advance || 0,
            aadhar, pancard, profile
        ]);

        res.status(201).json({ success: true, message: "Employee and Profile Image added successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


exports.updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, commission, birthdate, salary, expense, advance } = req.body;

        // ✅ FIX: Extract only YYYY-MM-DD from the birthdate string
        // This handles both "2026-01-10T00:00:00.000Z" and "2026-01-10"
        const formattedBirthdate = birthdate ? birthdate.split('T')[0] : null;

        // Base SQL and parameters
        let updateSql = `UPDATE employees SET name=?, email=?, phone=?, commission=?, birthdate=?, salary=?, expense=?, advance=?`;
        let params = [
            name,
            email,
            phone,
            commission || 0,
            formattedBirthdate, // Use the cleaned date here
            salary || 0,
            expense || 0,
            advance || 0
        ];

        // ... [Rest of your photo logic remains the same] ...

        if (req.files?.aadhar) {
            updateSql += `, aadhar_photo=?`;
            params.push(req.files.aadhar[0].filename);
        }
        if (req.files?.pancard) {
            updateSql += `, pancard_photo=?`;
            params.push(req.files.pancard[0].filename);
        }
        if (req.files?.profile) {
            updateSql += `, profile_photo=?`;
            params.push(req.files.profile[0].filename);
        }

        updateSql += ` WHERE id=?`;
        params.push(id);

        const [result] = await db.query(updateSql, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Employee not found" });
        }

        res.json({ success: true, message: "Employee updated successfully" });
    } catch (error) {
        console.error("Update Error:", error);
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

exports.employeeLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password required",
            });
        }

        // =====================
        // 🔑 ADMIN LOGIN (STATIC)
        // =====================
        if (email === "admin@gmail.com" && password === "123") {
            const token = jwt.sign(
                {
                    id: 0,
                    role: "admin",
                    email: "admin@gmail.com",
                },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN }
            );

            return res.json({
                success: true,
                role: "admin",
                token,
                user: {
                    name: "Admin",
                    email: "admin@gmail.com",
                },
            });
        }

        // =====================
        // 👤 EMPLOYEE LOGIN
        // =====================
        // Directly fetching from employees table
        const [rows] = await db.query(
            "SELECT * FROM employees WHERE email = ?",
            [email]
        );

        if (!rows.length) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const employee = rows[0];

        // ⚠️ Plain password check
        if (employee.password !== password) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        // =====================
        // 🎫 JWT TOKEN (Removed permissions table logic)
        // =====================
        const token = jwt.sign(
            {
                id: employee.id,
                role: "employee",
                email: employee.email,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({
            success: true,
            role: "employee",
            token,
            user: {
                id: employee.id,
                name: employee.name,
                email: employee.email,
                phone: employee.phone,
                commission: employee.commission,
                salary: employee.salary,
                profile_photo: employee.profile_photo // Included since we added this earlier
            },
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};



exports.punchAttendance = async (req, res) => {
    try {
        // 1. Ensure table exists
        await ensureSetup();

        const { employeeId, status } = req.body;

        if (!employeeId || !status) {
            return res.status(400).json({ success: false, message: "Missing Data" });
        }

        // 2. Simple Database Insert (No Image Processing)
        const sql = "INSERT INTO attendance (employeeId, status, is_verified) VALUES (?, ?, ?)";
        await db.query(sql, [employeeId, status, true]);

        return res.json({
            success: true,
            message: `Punch ${status} recorded successfully!`
        });

    } catch (error) {
        console.error("Punch Error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};
exports.getLastStatus = async (req, res) => {
    try {
        const { id } = req.params;

        // Query to get all punch types for today
        const sql = `
            SELECT status 
            FROM attendance 
            WHERE employeeId = ? 
            AND DATE(punch_time) = CURDATE() 
            ORDER BY punch_time ASC
        `;

        const [rows] = await db.query(sql, [id]);

        let finalStatus = null;

        if (rows.length === 0) {
            finalStatus = "READY"; // No records yet
        } else if (rows.some(r => r.status === 'OUT')) {
            finalStatus = "COMPLETED"; // Already punched out once today
        } else if (rows.some(r => r.status === 'IN')) {
            finalStatus = "IN"; // Punched in, but not out yet
        }

        res.json({
            success: true,
            lastStatus: finalStatus
        });
    } catch (error) {
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};