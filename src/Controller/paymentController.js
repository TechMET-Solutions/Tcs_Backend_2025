const db = require('../../Config/database');

// 1. Send a new payment request for approval
exports.createRequest = async (req, res) => {
    const { quotation_id, amount, paymentType, remark } = req.body;

    const createTableSql = `
        CREATE TABLE IF NOT EXISTS payment_requests (
            id INT PRIMARY KEY AUTO_INCREMENT,
            quotation_id INT,
            amount DECIMAL(10,2),
            payment_type VARCHAR(50),
            remark TEXT,
            status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quotation_id) REFERENCES quotations(id)
        )
    `;

    const insertSql = `
        INSERT INTO payment_requests 
        (quotation_id, amount, payment_type, remark) 
        VALUES (?, ?, ?, ?)
    `;

    try {
        await db.query(createTableSql);
        await db.query(insertSql, [quotation_id, amount, paymentType, remark]);

        res.json({
            success: true,
            message: "Payment request sent for approval"
        });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({
            success: false,
            message: "Database operation failed",
            error: err.message
        });
    }
};

// 2. Fetch all pending requests for the Modal
exports.getPendingRequests = async (req, res) => {
    const sql = `SELECT 
                    pr.id, 
                    pr.amount, 
                    pr.payment_type, 
                    pr.remark, 
                    pr.status,
                    pr.quotation_id,
                    pr.created_at, 
                    q.clientName AS client_name 
                 FROM payment_requests pr 
                 JOIN quotations q ON pr.quotation_id = q.id 
                 WHERE pr.status = 'pending'
                 ORDER BY pr.created_at DESC`;
    try {
        const [rows] = await db.query(sql);
        res.json({ success: true, requests: rows });
    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 3. Handle Approval or Rejection (Transaction Based)
exports.handleStatusUpdate = async (req, res) => {
    const { requestId, status } = req.body;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Lock the row to prevent race conditions during approval
        const [requests] = await connection.query(
            "SELECT * FROM payment_requests WHERE id = ? FOR UPDATE",
            [requestId]
        );
        const request = requests[0];

        if (!request) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Request not found" });
        }

        if (request.status !== 'pending') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Request already processed" });
        }

        if (status === 'approved') {
            // Update the quotations table with the new balance
            const updateQuoteSql = `UPDATE quotations 
                                    SET paid_amount = COALESCE(paid_amount, 0) + ?, 
                                        due_amount = COALESCE(due_amount, 0) - ? 
                                    WHERE id = ?`;

            await connection.query(updateQuoteSql, [request.amount, request.amount, request.quotation_id]);

            // Mark the specific request as approved
            await connection.query(
                "UPDATE payment_requests SET status = 'approved' WHERE id = ?",
                [requestId]
            );

            await connection.commit();
            res.json({ success: true, message: "Payment approved. Quotation balance updated." });
        } else {
            // Simply mark as rejected
            await connection.query(
                "UPDATE payment_requests SET status = 'rejected' WHERE id = ?",
                [requestId]
            );
            await connection.commit();
            res.json({ success: true, message: "Payment request rejected." });
        }
    } catch (err) {
        await connection.rollback();
        console.error("Transaction Error:", err);
        res.status(500).json({ success: false, message: "Transaction failed", error: err.message });
    } finally {
        connection.release();
    }
};