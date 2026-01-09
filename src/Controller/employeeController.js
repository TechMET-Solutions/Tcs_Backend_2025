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
// Helper to ensure roles table exists (for admin/superadmin login)
const ensureRolesTable = async () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS roles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(100) NOT NULL,
            role ENUM('admin', 'superadmin') NOT NULL,
            status ENUM('active', 'blocked') DEFAULT 'active',
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `;
    await db.query(sql);

    // Check if default records exist, if not insert them
    // const [checkAdmin] = await db.query("SELECT * FROM roles WHERE email = ?", ["admin@gmail.com"]);
    // if (checkAdmin.length === 0) {
    //     await db.query(
    //         "INSERT INTO roles (email, password, role, status) VALUES (?, ?, ?, ?)",
    //         ["admin@gmail.com", "123", "admin", "active"]
    //     );
    // }

    // const [checkSuperAdmin] = await db.query("SELECT * FROM roles WHERE email = ?", ["superadmin@gmail.com"]);
    // if (checkSuperAdmin.length === 0) {
    //     await db.query(
    //         "INSERT INTO roles (email, password, role, status) VALUES (?, ?, ?, ?)",
    //         ["superadmin@gmail.com", "123", "superadmin", "active"]
    //     );
    // }
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
            attendance_date DATE NOT NULL,
            punch_in TIME,
            punch_out TIME,
            punch_in_image VARCHAR(255),
            punch_out_image VARCHAR(255),
            is_verified BOOLEAN DEFAULT FALSE,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_attendance (employeeId, attendance_date),
            FOREIGN KEY (employeeId) REFERENCES employees(id)
);
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
        // 1. Get pagination params from query (defaults: page 1, 10 items)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const imageBaseUrl = `${req.protocol}://${req.get('host')}/uploads/employees/`;

        // 2. Get total count for the frontend math
        const [countResult] = await db.query("SELECT COUNT(*) as total FROM employees");
        const totalItems = countResult[0].total;

        // 3. Get paginated data using LIMIT and OFFSET
        const [rows] = await db.query(
            "SELECT * FROM employees ORDER BY id DESC LIMIT ? OFFSET ?",
            [limit, offset]
        );

        const employeesWithImages = rows.map(emp => ({
            ...emp,
            aadhar_url: emp.aadhar_photo ? `${imageBaseUrl}${emp.aadhar_photo}` : null,
            pancard_url: emp.pancard_photo ? `${imageBaseUrl}${emp.pancard_photo}` : null,
            profile_url: emp.profile_photo ? `${imageBaseUrl}${emp.profile_photo}` : null
        }));

        res.json({
            success: true,
            employees: employeesWithImages,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
                limit
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// exports.employeeLogin = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         if (!email || !password) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Email and password required",
//             });
//         }

//         // =====================
//         // 🔑 ADMIN LOGIN (STATIC)
//         // =====================
//         if (email === "admin@gmail.com" && password === "123") {
//             const token = jwt.sign(
//                 { id: 0, role: "admin", email: "admin@gmail.com" },
//                 process.env.JWT_SECRET,
//                 { expiresIn: process.env.JWT_EXPIRES_IN }
//             );

//             return res.json({
//                 success: true,
//                 role: "admin",
//                 token,
//                 user: { name: "Admin", email: "admin@gmail.com" },
//                 permissions: {} // Admins usually have all, or an empty object if handled differently
//             });
//         }

//         // =====================
//         // 👤 EMPLOYEE LOGIN
//         // =====================
//         const [rows] = await db.query(
//             "SELECT * FROM employees WHERE email = ?",
//             [email]
//         );

//         if (!rows.length) {
//             return res.status(401).json({ success: false, message: "Invalid email or password" });
//         }

//         const employee = rows[0];

//         // ⚠️ Note: In production, use bcrypt.compare(password, employee.password)
//         if (employee.password !== password) {
//             return res.status(401).json({ success: false, message: "Invalid email or password" });
//         }

//         // =====================
//         // 🛡️ FETCH PERMISSIONS
//         // =====================
//         // Assuming the table 'employee_permissions' has a column 'permissions' (JSON) and 'employee_id'
//         const [permissionRows] = await db.query(
//             "SELECT permissions FROM employee_permissions WHERE employee_id = ?",
//             [employee.id]
//         );

//         // If no specific permissions found, default to an empty object
//         const permissions = permissionRows.length > 0 ? permissionRows[0].permissions : {};

//         // =====================
//         // 🎫 JWT TOKEN
//         // =====================
//         const token = jwt.sign(
//             {
//                 id: employee.id,
//                 role: "employee",
//                 email: employee.email,
//                 permissions: permissions // Include permissions in the token for easy access in middleware
//             },
//             process.env.JWT_SECRET,
//             { expiresIn: process.env.JWT_EXPIRES_IN }
//         );

//         res.json({
//             success: true,
//             role: "employee",
//             token,
//             user: {
//                 id: employee.id,
//                 name: employee.name,
//                 email: employee.email,
//                 phone: employee.phone,
//                 commission: employee.commission,
//                 salary: employee.salary,
//                 profile_photo: employee.profile_photo
//             },
//             permissions: permissions // Pass the permission JSON to the frontend
//         });

//     } catch (error) {
//         console.error("Login Error:", error);
//         res.status(500).json({
//             success: false,
//             error: error.message,
//         });
//     }
// };

exports.employeeLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password required",
            });
        }


        await ensureRolesTable(); // Ensure table and default records exist

        const [roleRows] = await db.query(
            "SELECT * FROM roles WHERE email = ?",
            [email]
        );

        if (roleRows.length > 0) {
            const roleUser = roleRows[0];

            // Check status
            if (roleUser.status !== "active") {
                return res.status(403).json({
                    success: false,
                    message: "Your account is inactive. Please contact support."
                });
            }

            // Verify password
            if (roleUser.password !== password) {
                return res.status(401).json({ success: false, message: "Invalid email or password" });
            }

            // Generate token for admin/superadmin
            const token = jwt.sign(
                { id: roleUser.id, role: roleUser.role, email: roleUser.email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN }
            );

            return res.json({
                success: true,
                role: roleUser.role,
                token,
                user: { name: roleUser.role.charAt(0).toUpperCase() + roleUser.role.slice(1), email: roleUser.email },
                permissions: {}
            });
        }

        // =====================
        // 👤 EMPLOYEE LOGIN
        // =====================
        const [rows] = await db.query(
            "SELECT * FROM employees WHERE email = ?",
            [email]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        const employee = rows[0];

        // 🛡️ STATUS CHECK
        // If the status is 'inactive', block the login immediately.
        if (employee.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Please contact support."
            });
        }

        // 🔑 PASSWORD CHECK
        // ⚠️ Note: In production, use bcrypt.compare(password, employee.password)
        if (employee.password !== password) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        // =====================
        // 🛡️ FETCH PERMISSIONS
        // =====================
        const [permissionRows] = await db.query(
            "SELECT permissions FROM employee_permissions WHERE employee_id = ?",
            [employee.id]
        );

        const permissions = permissionRows.length > 0 ? permissionRows[0].permissions : {};

        // =====================
        // 🎫 JWT TOKEN
        // =====================
        const token = jwt.sign(
            {
                id: employee.id,
                role: "employee",
                email: employee.email,
                permissions: permissions
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
                profile_photo: employee.profile_photo
            },
            permissions: permissions
        });

    } catch (error) {
        console.error("Login Error:", error);
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
        const { employeeId } = req.params;

        // Use 'en-CA' to force YYYY-MM-DD format in local time
        const today = new Date().toLocaleDateString('en-CA');

        const [rows] = await db.query(
            "SELECT punch_in, punch_out FROM attendance WHERE employeeId=? AND attendance_date=?",
            [employeeId, today]
        );

        // If no row exists for TODAY'S date, it's safe to show READY
        if (rows.length === 0) {
            return res.json({ success: true, status: "READY" });
        }

        if (rows[0].punch_out) {
            return res.json({ success: true, status: "COMPLETED" });
        }

        return res.json({ success: true, status: "IN" });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// routes/attendance.js
exports.punchIn = async (req, res) => {
    const { employeeId, image } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    try {
        await ensureAttendanceTable();

        const [existing] = await db.query(
            "SELECT * FROM attendance WHERE employeeId=? AND attendance_date=?",
            [employeeId, today]
        );

        if (existing.length && existing[0].punch_in) {
            return res.status(400).json({ message: "Already punched in" });
        }

        await db.query(`
            INSERT INTO attendance (employeeId, attendance_date, punch_in, punch_in_image, is_verified)
            VALUES (?, ?, CURTIME(), ?, 1)
            ON DUPLICATE KEY UPDATE punch_in=CURTIME(), punch_in_image=?`,
            [employeeId, today, image, image]
        );

        res.json({ message: "Punch In successful" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};




exports.punchOut = async (req, res) => {
    const { employeeId, image } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    try {
        const [attendance] = await db.query(
            "SELECT * FROM attendance WHERE employeeId=? AND attendance_date=?",
            [employeeId, today]
        );

        if (!attendance.length || !attendance[0].punch_in) {
            return res.status(400).json({ message: "Punch in first" });
        }

        if (attendance[0].punch_out) {
            return res.status(400).json({ message: "Already punched out" });
        }

        await db.query(`
            UPDATE attendance
            SET punch_out=CURTIME(), punch_out_image=?
            WHERE employeeId=? AND attendance_date=?`,
            [image, employeeId, today]
        );

        res.json({ message: "Punch Out successful" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};



// =====================
// 👑 ROLE MANAGEMENT ENDPOINTS
// =====================

// Get all roles (admin/superadmin)
exports.getAllRoles = async (req, res) => {
    try {
        await ensureRolesTable();
        const [rows] = await db.query("SELECT id, email, role, status, createdAt FROM roles ORDER BY id DESC");
        res.json({ success: true, roles: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Create new role (Admin/Superadmin)
exports.createRole = async (req, res) => {
    try {
        await ensureRolesTable();
        const { email, password, role } = req.body;

        if (!email || !password || !role) {
            return res.status(400).json({ success: false, message: "Email, password, and role required" });
        }

        if (!["admin", "superadmin"].includes(role)) {
            return res.status(400).json({ success: false, message: "Role must be 'admin' or 'superadmin'" });
        }

        const sql = "INSERT INTO roles (email, password, role, status) VALUES (?, ?, ?, ?)";
        await db.query(sql, [email, password, role, "active"]);

        res.status(201).json({ success: true, message: "Role created successfully" });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            res.status(400).json({ success: false, message: "Email already exists" });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

// Update role
exports.updateRole = async (req, res) => {
    try {
        await ensureRolesTable();
        const { id } = req.params;
        const { email, password, role, status } = req.body;

        let updateSql = "UPDATE roles SET ";
        let params = [];
        let updates = [];

        if (email !== undefined) {
            updates.push("email = ?");
            params.push(email);
        }
        if (password !== undefined) {
            updates.push("password = ?");
            params.push(password);
        }
        if (role !== undefined) {
            updates.push("role = ?");
            params.push(role);
        }
        if (status !== undefined) {
            updates.push("status = ?");
            params.push(status);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: "No fields to update" });
        }

        updateSql += updates.join(", ") + " WHERE id = ?";
        params.push(id);

        const [result] = await db.query(updateSql, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Role not found" });
        }

        res.json({ success: true, message: "Role updated successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Delete role
exports.deleteRole = async (req, res) => {
    try {
        await ensureRolesTable();
        const { id } = req.params;

        const [result] = await db.query("DELETE FROM roles WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Role not found" });
        }

        res.json({ success: true, message: "Role deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Toggle role status
exports.toggleRoleStatus = async (req, res) => {
    try {
        await ensureRolesTable();
        const { id } = req.params;
        const { status } = req.body;

        if (!["active", "blocked"].includes(status)) {
            return res.status(400).json({ success: false, message: "Status must be 'active' or 'blocked'" });
        }

        const [result] = await db.query("UPDATE roles SET status = ? WHERE id = ?", [status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Role not found" });
        }

        res.json({ success: true, message: `Role ${status}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Month-wise Attendance (React Table ke liye)

exports.MonthAttendance = async (req, res) => {
    const { employeeId } = req.params;
    const { month } = req.query; // YYYY-MM

    try {
        const [rows] = await db.query(
            `SELECT 
         attendance_date AS date,
         TIME_FORMAT(punch_in, '%h:%i %p') AS punchIn,
         TIME_FORMAT(punch_out, '%h:%i %p') AS punchOut
       FROM attendance
       WHERE employeeId=? AND DATE_FORMAT(attendance_date,'%Y-%m')=? 
       ORDER BY attendance_date DESC`,
            [employeeId, month]
        );

        res.json({ records: rows });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// Attendance Summary API (Stats Cards) GET

exports.attendanceSummary = async (req, res) => {
    const { employeeId } = req.params;
    const { month } = req.query;

    try {
        const [rows] = await db.query(
            `SELECT 
        COUNT(*) AS daysPresent,
        AVG(TIMESTAMPDIFF(MINUTE, punch_in, punch_out))/60 AS avgHours
       FROM attendance
       WHERE employeeId=? 
       AND punch_in IS NOT NULL 
       AND punch_out IS NOT NULL
       AND DATE_FORMAT(attendance_date,'%Y-%m')=?`,
            [employeeId, month]
        );

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};
