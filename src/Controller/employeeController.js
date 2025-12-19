const db = require("../../Config/database");
const jwt = require("jsonwebtoken");
// =====================
// ENSURE TABLE EXISTS
// =====================
const ensureEmployeesTable = async () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS employees (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL,
            password VARCHAR(100) NOT NULL,
            phone VARCHAR(15),
            commission DECIMAL(5,2) DEFAULT 0,
            birthdate DATE,
            salary DECIMAL(10,2) DEFAULT 0,
            expense DECIMAL(10,2) DEFAULT 0,
            advance DECIMAL(10,2) DEFAULT 0,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await db.query(sql);
};

// =====================
// CREATE EMPLOYEE
// =====================
exports.createEmployee = async (req, res) => {
    try {
        await ensureEmployeesTable();

        const {
            name,
            email,
            password,
            phone,
            commission,
            birthdate,
            salary,
            expense,
            advance,
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Required fields missing",
            });
        }

        const sql = `
            INSERT INTO employees
            (name, email, password, phone, commission, birthdate, salary, expense, advance)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.query(sql, [
            name,
            email,
            password,
            phone || null,
            commission || 0,
            birthdate || null,
            salary || 0,
            expense || 0,
            advance || 0,
        ]);

        res.status(201).json({
            success: true,
            message: "Employee added successfully",
            employeeId: result.insertId,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};

// =====================
// GET EMPLOYEES
// =====================
exports.getEmployees = async (req, res) => {
    try {
        await ensureEmployeesTable();

        const [rows] = await db.query(`
            SELECT 
                id,
                name,
                email,
                phone,
                commission,
                birthdate,
                salary,
                expense,
                advance,
                createdAt
            FROM employees
            ORDER BY id DESC
        `);

        res.json({
            success: true,
            employees: rows,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};

const ensureEmployeeRolesTable = async () => {
    const sql = `
        CREATE TABLE IF NOT EXISTS employee_roles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employeeId INT NOT NULL,
            permissions JSON NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,

            CONSTRAINT fk_employee_roles
            FOREIGN KEY (employeeId)
            REFERENCES employees(id)
            ON DELETE CASCADE
        )
    `;

    // ✅ PROMISE STYLE (NO CALLBACK)
    await db.query(sql);
};

exports.saveEmployeeRoles = async (req, res) => {
    try {
        // ✅ 1. ENSURE TABLE FIRST
        await ensureEmployeeRolesTable();

        const { employeeId, permissions } = req.body;

        if (!employeeId || !permissions) {
            return res.status(400).json({
                success: false,
                message: "employeeId and permissions are required",
            });
        }

        // ✅ 2. CHECK EXISTING ROLE
        const [existing] = await db.query(
            "SELECT id FROM employee_roles WHERE employeeId = ?",
            [employeeId]
        );

        if (existing.length > 0) {
            // ✅ UPDATE
            await db.query(
                "UPDATE employee_roles SET permissions = ? WHERE employeeId = ?",
                [JSON.stringify(permissions), employeeId]
            );
        } else {
            // ✅ INSERT
            await db.query(
                "INSERT INTO employee_roles (employeeId, permissions) VALUES (?, ?)",
                [employeeId, JSON.stringify(permissions)]
            );
        }

        res.json({
            success: true,
            message: "Employee roles saved successfully",
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};

exports.getEmployeeRoles = async (req, res) => {
    try {
        // ✅ ENSURE TABLE EXISTS
        await ensureEmployeeRolesTable();

        const { employeeId } = req.params;

        const [rows] = await db.query(
            "SELECT permissions FROM employee_roles WHERE employeeId = ?",
            [employeeId]
        );

        res.json({
            success: true,
            permissions: rows.length
                ? JSON.parse(rows[0].permissions) // ✅ CONVERT TO JSON
                : {},
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
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

        // ⚠️ Plain password check (bcrypt later)
        if (employee.password !== password) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        // =====================
        // FETCH EMPLOYEE ROLES
        // =====================
        const [roleRows] = await db.query(
            "SELECT permissions FROM employee_roles WHERE employeeId = ?",
            [employee.id]
        );

        const permissions = roleRows.length
            ? JSON.parse(roleRows[0].permissions)
            : {};

        // =====================
        // JWT TOKEN
        // =====================
        const token = jwt.sign(
            {
                id: employee.id,
                role: "employee",
                email: employee.email,
                permissions,
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
                permissions,
            },
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};