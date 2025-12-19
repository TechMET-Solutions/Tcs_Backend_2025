const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});
console.log("DB USER =>", process.env.DB_USER);
console.log("DB PASSWORD =>", process.env.DB_PASSWORD);
// ✅ Test Connection
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log("✅ Connected to MySQL database");
        conn.release();
    } catch (err) {
        console.error("❌ Database connection failed:", err.message);
    }
})();

module.exports = pool;
