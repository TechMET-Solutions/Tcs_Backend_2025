// Controller/quotationController.js

const db = require("../../Config/database");
const puppeteer = require("puppeteer");
// 🔥 Ensure all required tables + columns exist
const ensureTablesExist = async (conn) => {

    // QUOTATION MASTER TABLE
    await conn.query(`
        CREATE TABLE IF NOT EXISTS quotations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            clientName VARCHAR(255),
            contactNo VARCHAR(50),
            email VARCHAR(255),
            address TEXT,
            attendedBy VARCHAR(255),
            architect VARCHAR(255),
            headerSection LONGTEXT,
            bottomSection LONGTEXT,
            grandTotal DECIMAL(12,2),
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // QUOTATION ITEMS TABLE
    await conn.query(`
        CREATE TABLE IF NOT EXISTS quotation_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            quotationId INT,
            productId INT,
            size VARCHAR(50),
            quality VARCHAR(50),
            rate DECIMAL(10,2),
            cov DECIMAL(10,2),
            box INT,
            weight DECIMAL(10,2),
            discount DECIMAL(10,2),
            total DECIMAL(12,2),
            area DECIMAL(12,2),
            FOREIGN KEY (quotationId) REFERENCES quotations(id),
            FOREIGN KEY (productId) REFERENCES products(id)
        );
    `);

    // ⭐ ADD COLUMN availQty IF NOT EXISTS
    await conn.query(`
        ALTER TABLE products 
        ADD COLUMN IF NOT EXISTS availQty INT DEFAULT 0;
    `);
};



exports.saveQuotation = async (req, res) => {
    const {
        clientDetails,
        headerSection,
        bottomSection,
        rows,
        grandTotal,
    } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        // 🔥 CREATE TABLES + MISSING COLUMNS
        await ensureTablesExist(conn);

        // 1️⃣ INSERT QUOTATION MASTER
        const [quotation] = await conn.query(
            `INSERT INTO quotations 
                (clientName, contactNo, email, address, attendedBy, architect, headerSection, bottomSection, grandTotal)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                clientDetails.name,
                clientDetails.contactNo,
                clientDetails.email,
                clientDetails.address,
                clientDetails.attendedBy,
                clientDetails.architect,
                headerSection,
                bottomSection,
                grandTotal,
            ]
        );

        const quotationId = quotation.insertId;

        // 2️⃣ INSERT ITEMS + UPDATE STOCK
        for (let r of rows) {
            await conn.query(
                `INSERT INTO quotation_items
                  (quotationId, productId, size, quality, rate, cov, box, weight, discount, total, area)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    quotationId,
                    r.productId,
                    r.size,
                    r.quality,
                    r.rate,
                    r.cov,
                    r.box,
                    r.weight,
                    r.discount,
                    r.total,
                    r.area,
                ]
            );

            // 🔥 SAFE STOCK UPDATE (zero पेक्षा खाली जाणार नाही)
            await conn.query(
                `UPDATE products 
                 SET availQty = GREATEST(availQty - ?, 0)
                 WHERE id = ?`,
                [r.box, r.productId]
            );
        }

        await conn.commit();

        res.json({
            success: true,
            message: "Quotation saved successfully!",
        });

    } catch (err) {
        await conn.rollback();
        res.status(500).json({
            success: false,
            error: err.message,
        });
    } finally {
        conn.release();
    }
};
// ======================= GET ALL QUOTATIONS =======================
// ======================= GET ALL QUOTATIONS WITH ITEMS =======================
// exports.getAllQuotationsFull = async (req, res) => {
//     try {
//         // 1️⃣ GET ALL QUOTATIONS
//         const [quotations] = await db.query(
//             `SELECT * FROM quotations ORDER BY id DESC`
//         );

//         // 2️⃣ LOOP EACH QUOTATION
//         for (let q of quotations) {

//             // 2.1️⃣ GET ITEMS of this quotation
//             const [items] = await db.query(
//                 `SELECT qi.*, 
//                         p.name AS productName
//                  FROM quotation_items qi
//                  LEFT JOIN products p ON p.id = qi.productId
//                  WHERE qi.quotationId = ?`,
//                 [q.id]
//             );

//             // 2.2️⃣ FOR EACH ITEM — GET PRODUCT BATCHES + STOCK
//             for (let item of items) {

//                 // Get all batches of this product
//                 const [batches] = await db.query(
//                     `SELECT batch_no, qty, location 
//                      FROM product_batches 
//                      WHERE product_id = ?`,
//                     [item.productId]
//                 );

//                 // Calculate total stock
//                 const totalStock = batches.reduce((sum, b) => sum + b.qty, 0);

//                 // Add inside item object
//                 item.batches = batches;
//                 item.currentStock = totalStock;
//             }

//             q.items = items;
//         }

//         res.json({
//             success: true,
//             quotations
//         });

//     } catch (err) {
//         res.status(500).json({
//             success: false,
//             error: err.message
//         });
//     }
// };

exports.getAllQuotationsFull = async (req, res) => {
    try {

        // ⭐ Ensure DC tables exist before using them
        await db.query(`
            CREATE TABLE IF NOT EXISTS delivery_challan (
                id INT AUTO_INCREMENT PRIMARY KEY,
                quotationId INT,
                client VARCHAR(255),
                contact VARCHAR(50),
                address TEXT,
                deliveryBoy VARCHAR(255),
                driverContact VARCHAR(50),
                tempo VARCHAR(50),
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS delivery_challan_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                challanId INT,
                productId INT,
                productName VARCHAR(255),
                dispatchBoxes INT,
                dispatchQty INT,
                remainingStock INT,
                FOREIGN KEY (challanId) REFERENCES delivery_challan(id)
            );
        `);

        // 1️⃣ GET ALL QUOTATIONS
        const [quotations] = await db.query(
            `SELECT * FROM quotations ORDER BY id DESC`
        );

        for (let q of quotations) {

            const [items] = await db.query(
                `SELECT qi.*, p.name AS productName
                 FROM quotation_items qi
                 LEFT JOIN products p ON p.id = qi.productId
                 WHERE qi.quotationId = ?`,
                [q.id]
            );

            for (let item of items) {

                // GET PREVIOUS DELIVERIES
                const [[dc]] = await db.query(
                    `SELECT 
                        IFNULL(SUM(dispatchBoxes), 0) AS dispatchedBoxes,
                        IFNULL(SUM(dispatchQty), 0) AS dispatchedQty
                     FROM delivery_challan_items dci
                     JOIN delivery_challan dc ON dc.id = dci.challanId
                     WHERE dc.quotationId = ? AND dci.productId = ?`,
                    [q.id, item.productId]
                );

                item.dispatchedBoxes = dc.dispatchedBoxes;
                item.dispatchedQty = dc.dispatchedQty;

                item.remainingBoxes = item.box - dc.dispatchedBoxes;
                item.remainingQty = item.area - dc.dispatchedQty;

                if (item.remainingBoxes < 0) item.remainingBoxes = 0;
                if (item.remainingQty < 0) item.remainingQty = 0;

                const [batches] = await db.query(
                    `SELECT batch_no, qty, location 
                     FROM product_batches 
                     WHERE product_id = ?`,
                    [item.productId]
                );

                item.batches = batches;
                item.currentStock = batches.reduce((s, b) => s + b.qty, 0);
            }

            q.items = items;
        }

        res.json({ success: true, quotations });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};



exports.printQuotation = async (req, res) => {
    const { id } = req.params;

    try {
        // FETCH QUOTATION MASTER
        const [[quotation]] = await db.query(
            `SELECT * FROM quotations WHERE id = ?`,
            [id]
        );

        // FETCH ITEMS
        const [items] = await db.query(
            `SELECT qi.*, p.name as productName, p.image as productImage
       FROM quotation_items qi
       JOIN products p ON p.id = qi.productId
       WHERE quotationId = ?`,
            [id]
        );

        quotation.items = items;

        // ---------------- HTML QUOTATION DESIGN (MATCHED WITH YOUR SCREENSHOT) ---------------- //
        let itemRows = items
            .map(
                (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${it.productId}</td>
        <td>${it.size}</td>
        <td><img src="http://localhost:5000/uploads/${it.productImage}" width="50"/></td>
        <td>${it.quality}</td>
        <td>${it.rate}</td>
        <td>${it.discount}</td>
        <td>${it.box}</td>
        <td>${it.area}</td>
        <td>${it.total}</td>
      </tr>
    `
            )
            .join("");

        const html = `
    <html>
    <head>
    <style>
      body { font-family: Arial; padding: 20px; }

      .header-box {
        border: 1px solid #000;
        padding: 10px;
      }

      .company-info { float:left; width:70%; }
      .logo-box { float:right; width:30%; text-align:right; }

      .title {
        text-align:center;
        font-size:22px;
        margin:20px 0;
        font-weight:bold;
        text-decoration:underline;
      }

      table { width:100%; border-collapse:collapse; margin-top:10px; }
      td, th { border:1px solid #000; padding:6px; font-size:14px; text-align:center; }

      .terms-box { margin-top:20px; line-height:1.5; }

      .sign {
        margin-top: 40px;
        float:right;
        text-align:center;
      }
    </style>
    </head>

    <body>

      <!-- COMPANY HEADER -->
      <div class="header-box">
        <div class="company-info">
            <b>THE CERAMIC STUDIO</b><br>
            Shop no. 18, Business Bay, Mumbai Naka, Nashik - 422002<br>
            Contact: 8847788888 / 7085899999<br>
            Email: support@theceramicstudio.in
        </div>
        <div class="logo-box">
           <img src="http://localhost:5000/assets/tcslog.png" style="width:160px; height:120px; object-fit:contain;" />

        </div>
        <div style="clear:both;"></div>
      </div>

      <div class="title">Quotation</div>

      <!-- CLIENT DETAILS -->
      <table>
        <tr>
          <td><b>To</b></td>
          <td>${quotation.clientName}</td>
          <td><b>Date</b></td>
          <td>${new Date(quotation.createdAt).toLocaleDateString()}</td>
        </tr>

        <tr>
          <td><b>Mobile</b></td>
          <td>${quotation.contactNo}</td>
          <td><b>Email</b></td>
          <td>${quotation.email}</td>
        </tr>

        <tr>
          <td><b>Attended By</b></td>
          <td>${quotation.attendedBy}</td>
          <td><b>Architect</b></td>
          <td>${quotation.architect}</td>
        </tr>
      </table>

      <p style="margin-top:15px;">
        This is with reference to our discussion with you regarding your requirement;
        here we quote our best price for your prestigious project as below:
      </p>

      <!-- PRODUCT TABLE -->
      <table>
        <thead>
          <tr>
            <th>SrNo</th>
            <th>Code</th>
            <th>Size</th>
            <th>Image</th>
            <th>Quality</th>
            <th>Rate</th>
            <th>Dis</th>
            <th>Box</th>
            <th>Area</th>
            <th>Amount</th>
          </tr>
        </thead>

        <tbody>
         ${itemRows}
        </tbody>

        <tfoot>
          <tr>
            <td colspan="9" style="text-align:right;"><b>Total</b></td>
            <td><b>${quotation.grandTotal}</b></td>
          </tr>
        </tfoot>
      </table>

      <!-- TERMS -->
      <div class="terms-box">
        ${quotation.bottomSection}
      </div>

      <div class="sign">
         <b>For THE CERAMIC STUDIO</b><br><br><br>
         _______________________<br>
         Authorized Signature
      </div>

    </body>
    </html>
    `;

        // ---------------- GENERATE PDF ---------------- //
        const browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox"],
        });
        const page = await browser.newPage();

        await page.setContent(html, { waitUntil: "networkidle0" });

        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "10mm", bottom: "10mm" },
        });

        await browser.close();

        res.set({
            "Content-Type": "application/pdf",
            "Content-Length": pdf.length,
            "Content-Disposition": `attachment; filename=Quotation_${id}.pdf`,
        });

        return res.send(pdf);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.generateDeliveryChallan = async (req, res) => {
    const {
        quotationId,
        client,
        contact,
        address,
        driverDetails,
        items
    } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        // 1️⃣ MASTER TABLE CREATE IF NOT EXISTS
        await conn.query(`
            CREATE TABLE IF NOT EXISTS delivery_challan (
                id INT AUTO_INCREMENT PRIMARY KEY,
                quotationId INT,
                client VARCHAR(255),
                contact VARCHAR(50),
                address TEXT,
                deliveryBoy VARCHAR(255),
                driverContact VARCHAR(50),
                tempo VARCHAR(50),
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2️⃣ ITEMS TABLE
        await conn.query(`
            CREATE TABLE IF NOT EXISTS delivery_challan_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                challanId INT,
                productId INT,
                productName VARCHAR(255),
                dispatchBoxes INT,
                dispatchQty INT,
                remainingStock INT,
                FOREIGN KEY (challanId) REFERENCES delivery_challan(id)
            );
        `);

        // 3️⃣ Insert into challan master
        const [challan] = await conn.query(
            `INSERT INTO delivery_challan 
                (quotationId, client, contact, address, deliveryBoy, driverContact, tempo)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                quotationId,
                client,
                contact,
                address,
                driverDetails.deliveryBoy,
                driverDetails.contact,
                driverDetails.tempo,
            ]
        );

        const challanId = challan.insertId;

        // ==============================
        // 4️⃣ Process each product
        // ==============================
        for (let p of items) {

            const dispatchQty = p.totalDispatchQty;

            // ➤ Insert challan item
            await conn.query(
                `INSERT INTO delivery_challan_items 
                    (challanId, productId, productName, dispatchBoxes, dispatchQty, remainingStock)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    challanId,
                    p.productId,
                    p.productName,
                    p.dispatchBoxes,
                    dispatchQty,
                    p.remainingStock
                ]
            );

            // 🔥 FIFO Stock Deduction (from product_batches)
            let remaining = dispatchQty;

            // Fetch batches
            const [batches] = await conn.query(
                `SELECT id, qty FROM product_batches 
                 WHERE product_id = ? ORDER BY batch_no ASC`,
                [p.productId]
            );

            for (let b of batches) {
                if (remaining <= 0) break;

                if (b.qty > remaining) {
                    // Reduce qty in this batch
                    await conn.query(
                        `UPDATE product_batches SET qty = qty - ? WHERE id = ?`,
                        [remaining, b.id]
                    );
                    remaining = 0;
                } else {
                    remaining -= b.qty;
                    await conn.query(
                        `UPDATE product_batches SET qty = 0 WHERE id = ?`,
                        [b.id]
                    );
                }
            }

            // Update product total available qty
            await conn.query(
                `UPDATE products 
                 SET availQty = availQty - ? 
                 WHERE id = ?`,
                [dispatchQty, p.productId]
            );

            // Update quotation_items → dispatched qty store करा
            await conn.query(
                `UPDATE quotation_items 
                 SET weight = weight + ? 
                 WHERE quotationId = ? AND productId = ?`,
                [dispatchQty, quotationId, p.productId]
            );

        }

        await conn.commit();

        res.json({
            success: true,
            challanId,
            message: "Delivery Challan Generated Successfully!"
        });

    } catch (err) {
        await conn.rollback();
        res.status(500).json({
            success: false,
            error: err.message
        });
    } finally {
        conn.release();
    }
};

exports.getAllDeliveryChallan = async (req, res) => {
    try {
        // 1️⃣ FETCH ALL CHALLANS
        const [challans] = await db.query(`
            SELECT 
                dc.id,
                dc.quotationId,
                dc.client,
                dc.contact,
                dc.address,
                dc.deliveryBoy,
                dc.driverContact,
                dc.tempo,
                dc.createdAt,
                COUNT(dci.id) AS totalItems
            FROM delivery_challan dc
            LEFT JOIN delivery_challan_items dci ON dci.challanId = dc.id
            GROUP BY dc.id
            ORDER BY dc.id DESC
        `);

        // 2️⃣ LOOP EACH CHALLAN → LOAD FULL DETAILS
        for (let c of challans) {

            // 2.1️⃣ GET DELIVERY ITEM DETAILS
            const [items] = await db.query(`
                SELECT dci.*, p.name AS productName, p.size, p.quality, p.image
                FROM delivery_challan_items dci
                LEFT JOIN products p ON p.id = dci.productId
                WHERE dci.challanId = ?
            `, [c.id]);

            c.items = items;

            // 2.2️⃣ GET QUOTATION MASTER
            const [[quotation]] = await db.query(`
                SELECT * FROM quotations WHERE id = ?
            `, [c.quotationId]);

            c.quotation = quotation;

            // 2.3️⃣ GET QUOTATION ITEMS
            const [quotationItems] = await db.query(`
                SELECT qi.*, p.name AS productName, p.image AS productImage
                FROM quotation_items qi
                LEFT JOIN products p ON p.id = qi.productId
                WHERE qi.quotationId = ?
            `, [c.quotationId]);

            c.quotationItems = quotationItems;
        }

        // 3️⃣ SEND FULL DATA
        res.json({
            success: true,
            challans
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

exports.printDeliveryChallan = async (req, res) => {
    const { challanId } = req.params;

    try {
        // FETCH MASTER
        const [[challan]] = await db.query(
            `SELECT * FROM delivery_challan WHERE id = ?`,
            [challanId]
        );

        if (!challan)
            return res.status(404).json({ success: false, message: "Challan not found" });

        // FETCH ITEMS
        const [items] = await db.query(
            `SELECT dci.*, p.name AS productName, p.size, p.quality, p.rate
             FROM delivery_challan_items dci
             LEFT JOIN products p ON p.id = dci.productId
             WHERE challanId = ?`,
            [challanId]
        );

        // FETCH QUOTATION DATA
        const [[quotation]] = await db.query(
            `SELECT * FROM quotations WHERE id = ?`,
            [challan.quotationId]
        );

        // ITEM ROWS
        const itemRows = items.map((it, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${it.productName}</td>
                <td>${it.size}</td>
                <td>${it.quality}</td>
                <td>${it.dispatchBoxes}</td>
                <td>${it.rate}</td>
                <td>${(it.rate * it.dispatchBoxes).toFixed(2)}</td>
            </tr>
        `).join("");

        // TOTAL
        const totalAmt = items.reduce(
            (t, a) => t + (a.dispatchBoxes * a.rate),
            0
        ).toFixed(2);

        // FINAL HTML (PERFECT SCREENSHOT MATCH)
        const html = `
<!DOCTYPE html>
<html>
<head>
<style>
body { 
    font-family: Arial; 
    padding: 20px;
    background: white;
}

.main-box { 
    width: 900px; 
    margin: auto; 
    border: 1px solid #000; 
    padding: 20px;
}

h2 {
    text-align: center;
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 5px;
}

.print-btn {
    text-align: right;
    font-size: 14px;
    margin-bottom: 10px;
}

.header-flex {
    display: flex; 
    justify-content: space-between; 
    border: 1px solid #000; 
    padding: 10px; 
    margin-bottom: 10px;
}

.company-text {
    width: 65%;
    font-size: 14px;
    line-height: 1.4;
}

.company-logo img { 
    width: 120px; 
}

table { 
    width: 100%; 
    border-collapse: collapse; 
}

td, th {
    border: 1px solid #000;
    padding: 6px;
    font-size: 14px;
}

/* HEADER COLOR */
thead tr {
    background: #EDEDED;
    font-weight: bold;
}

/* TOTAL ROW COLOR */
tfoot tr {
    background: #E6E6E6;
    font-weight: bold;
}

.section-table td {
    text-align: left;
}

.terms {
    margin-top: 20px;
    font-size: 13px;
    line-height: 1.5;
}

.footer {
    display: flex;
    justify-content: space-between;
    margin-top: 30px;
    font-size: 14px;
}
</style>
</head>

<body>

<div class="main-box">

<h2>Delivery Challan</h2>
<div class="print-btn">Print</div>

<!-- HEADER -->
<div class="header-flex">
    <div class="company-text">
        <b>THE CERAMIC STUDIO</b><br/>
        Shop no. 18, Business Bay<br/>
        Shree Hari Kute Marg<br/>
        Tidke Colony, Mumbai Naka<br/>
        Nashik - 422002<br/>
        CONT.: 8847788888, 7085899999<br/>
        Email: support@theceramicstudio.in
    </div>

   <div class="company-logo">
   <img src="http://localhost:5000/assets/tcslog.png" style="width:160px; height:120px; object-fit:contain;" />

</div>

</div>

<!-- CUSTOMER TABLE -->
<table class="section-table">
    <tr>
        <td><b>To:</b></td><td>${challan.client}</td>
        <td><b>Mobile No:</b></td><td>${challan.contact}</td>
    </tr>
    <tr>
        <td><b>Delivery Boy Name:</b></td><td>${challan.deliveryBoy}</td>
        <td><b>Challan No:</b></td><td>${challan.id}</td>
    </tr>
    <tr>
        <td><b>Weight Of Goods:</b></td><td>0.005 Tons</td>
        <td><b>Date:</b></td><td>${new Date(challan.createdAt).toLocaleString()}</td>
    </tr>
    <tr>
        <td><b>Contact:</b></td><td>${challan.driverContact}</td>
        <td><b>GST No:</b></td><td>${quotation?.gst || "-"}</td>
    </tr>
</table>

<br/>

<!-- ITEMS TABLE -->
<table>
<thead>
<tr>
    <th>Sr No</th>
    <th>Description of Goods</th>
    <th>Size</th>
    <th>Quality</th>
    <th>Box Qty</th>
    <th>Rate</th>
    <th>Amount</th>
</tr>
</thead>

<tbody>
${itemRows}
</tbody>

<tfoot>
<tr>
    <td colspan="6" style="text-align:right;">Total Amount</td>
    <td>${totalAmt}</td>
</tr>
</tfoot>
</table>

<!-- TERMS SECTION -->
<div class="terms">
<b>For NEFT or RTGS:</b><br/>
Yes Bank<br/>
Branch: Canada Corner<br/>
IFSC: YESB0000021<br/>
A/C Name: THE CERAMIC STUDIO<br/>
A/C No: 002163700004244<br/><br/>

<b>Terms:</b><br/>
All goods are delivered in good condition.<br/>
Our responsibility ceases once goods leave our premises.<br/>
Goods once sold will not be taken back.<br/>
No complaint regarding rates will be entertained.<br/>
Interest @24% per annum will be charged if bill not paid within 33 days.
</div>

<!-- FOOTER -->
<div class="footer">
    <div><b>Tempo No:</b> ${challan.tempo}</div>
    <div>Receiver's Signature</div>
</div>

</div>
</body>
</html>
`;

        // Generate PDF
        const browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox"]
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });

        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "10mm", bottom: "10mm" }
        });

        await browser.close();

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=DeliveryChallan_${challanId}.pdf`,
        });

        res.send(pdf);

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};



