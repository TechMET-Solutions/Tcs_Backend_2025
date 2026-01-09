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
            altContactNo VARCHAR(50),
            gstNo VARCHAR(50),
            email VARCHAR(255),
            address TEXT,
            attendedBy VARCHAR(255),
            additionalDiscount VARCHAR(50),
            architect VARCHAR(255),
            headerSection LONGTEXT,
            bottomSection LONGTEXT,
            grandTotal DECIMAL(12,2),
            paid_amount DECIMAL(12,2) DEFAULT 0.00,  -- ⭐ Added
            due_amount DECIMAL(12,2) DEFAULT 0.00,   -- ⭐ Added
            isSettled BOOLEAN DEFAULT FALSE,              -- ⭐ New Status Column
            commissionAmount DECIMAL(12,2) DEFAULT 0.00,  -- ⭐ New Commission Column
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
            area VARCHAR(50),
            FOREIGN KEY (quotationId) REFERENCES quotations(id),
            FOREIGN KEY (productId) REFERENCES products(id)
        );
    `);
    await conn.query(`
        CREATE TABLE IF NOT EXISTS architect_ledger (
            id INT AUTO_INCREMENT PRIMARY KEY,
            architectId VARCHAR(255),
            quotationId INT,
            commissionAmount DECIMAL(12,2),
            settledAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quotationId) REFERENCES quotations(id)
        );
    `);
    await conn.query(`
        CREATE TABLE IF NOT EXISTS architect_settlements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            architectId INT NOT NULL,
            quotationId INT NOT NULL,
            totalProjectAmount DECIMAL(12,2),
            settledAmount DECIMAL(12,2),
            settlementDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quotationId) REFERENCES quotations(id)
        );
    `);
    // ⭐ ADD COLUMN availQty IF NOT EXISTS
    await conn.query(`
        ALTER TABLE products 
        ADD COLUMN IF NOT EXISTS availQty INT DEFAULT 0;
    `);
    // ⭐ delivery_challan TABLE
    await conn.query(`
        CREATE TABLE IF NOT EXISTS delivery_challan (
            id INT AUTO_INCREMENT PRIMARY KEY,
            quotationId INT,
            client VARCHAR(255),
            contact VARCHAR(50),
            address TEXT,
            deliveryBoy VARCHAR(255),
            driverContact VARCHAR(50),
            tempo VARCHAR(50)
        );

    `);
    // ⭐ delivery_challan_items TABLE
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
};



exports.saveQuotation = async (req, res) => {
    const {
        clientDetails,
        additionalDiscount,
        headerSection,
        bottomSection,
        rows,
        grandTotal,
    } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        await ensureTablesExist(conn);

        // 1️⃣ Insert Master Record
        // We use clientDetails.architect to link the commission later
        const [quotation] = await conn.query(
            `INSERT INTO quotations 
                (clientName, contactNo, altContactNo, email, address, attendedBy, architect, headerSection, bottomSection, grandTotal, gstNo, paid_amount, due_amount, additionalDiscount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                clientDetails.name,
                clientDetails.contactNo,
                clientDetails.altContactNo || null,
                clientDetails.email || null,
                clientDetails.address,
                clientDetails.attendedBy || 'System',
                clientDetails.architect,
                headerSection,
                bottomSection,
                grandTotal,
                clientDetails.gstNo || '',
                0.00,        // Initial Paid
                grandTotal,   // Initial Due
                additionalDiscount
            ]
        );

        const quotationId = quotation.insertId;

        // 2️⃣ Insert Items (Saving your manual 'Area')
        for (let r of rows) {
            // Use the area manually entered from frontend row
            const itemArea = parseFloat(r.Area) || 0;

            await conn.query(
                `INSERT INTO quotation_items
                  (quotationId, productId, size, quality, rate, cov, box, weight, discount, total, area)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    quotationId,
                    r.productId,
                    r.size || '',
                    r.quality || '',
                    parseFloat(r.rate) || 0,
                    parseFloat(r.cov) || 0,
                    parseInt(r.box) || 0,
                    parseFloat(r.Weight) || 0,
                    parseFloat(r.discount) || 0,
                    parseFloat(r.total) || 0,
                    itemArea // This stores your manual typing
                ]
            );

            // 3️⃣ Update Stock
            if (r.productId) {
                await conn.query(
                    `UPDATE products SET availQty = GREATEST(availQty - ?, 0) WHERE id = ?`,
                    [parseInt(r.box) || 0, r.productId]
                );
            }
        }

        await conn.commit();
        res.json({ success: true, message: "Quotation saved successfully!", id: quotationId });

    } catch (err) {
        await conn.rollback();
        console.error("Error saving quotation:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        conn.release();
    }
};


exports.updateQuotation = async (req, res) => {
    const quotationId = req.params.id;
    const { clientDetails, additionalDiscount, headerSection, bottomSection, rows, grandTotal } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        // 1️⃣ Restore Stock
        const [oldItems] = await conn.query(
            `SELECT productId, box FROM quotation_items WHERE quotationId = ?`,
            [quotationId]
        );
        for (let item of oldItems) {
            await conn.query(`UPDATE products SET availQty = availQty + ? WHERE id = ?`, [item.box, item.productId]);
        }

        // 2️⃣ Update Master
        await conn.query(
            `UPDATE quotations SET 
                clientName=?, contactNo=?, altContactNo=?, email=?, address=?, attendedBy=?, architect=?,
                headerSection=?, bottomSection=?, grandTotal=?, gstNo=?, additionalDiscount=?, due_amount = (? - paid_amount)
             WHERE id = ?`,
            [
                clientDetails.name, clientDetails.contactNo, clientDetails.altContactNo, clientDetails.email, clientDetails.address,
                clientDetails.attendedBy, clientDetails.architect, headerSection, bottomSection,
                grandTotal, clientDetails.gstNo, additionalDiscount, grandTotal, quotationId
            ]
        );

        // 3️⃣ Replace Items
        await conn.query(`DELETE FROM quotation_items WHERE quotationId = ?`, [quotationId]);

        for (let r of rows) {
            // const itemArea = parseFloat(r.Area) || 0;
            await conn.query(
                `INSERT INTO quotation_items (quotationId, productId, size, quality, rate, cov, box, weight, discount, total, area)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [quotationId, r.productId, r.size, r.quality, r.rate, r.cov, r.box, r.Weight, r.discount, r.total,
                    r.Area
                ]
            );

            await conn.query(`UPDATE products SET availQty = GREATEST(availQty - ?, 0) WHERE id = ?`, [r.box, r.productId]);
        }

        await conn.commit();
        res.json({ success: true, message: "Quotation updated successfully!" });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, error: err.message });
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
        // 1. Pagination Parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        // await ensureTablesExist(conn);
        // 2. Get Total Count for UI calculation
        const [countResult] = await db.query("SELECT COUNT(*) as total FROM quotations");
        const totalItems = countResult[0].total;

        // 3. Fetch ONLY the Quotations for this page
        const [quotations] = await db.query(
            `SELECT * FROM quotations ORDER BY id DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        // 4. Fill in nested data for the 10 selected quotations
        for (let q of quotations) {
            const [items] = await db.query(
                `SELECT qi.*, p.name AS productName
                 FROM quotation_items qi
                 LEFT JOIN products p ON p.id = qi.productId
                 WHERE qi.quotationId = ?`,
                [q.id]
            );

            for (let item of items) {
                // Fetch Delivery Challan data for this item
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
                item.remainingBoxes = Math.max(0, item.box - dc.dispatchedBoxes);
                item.remainingQty = Math.max(0, item.area - dc.dispatchedQty);

                // Fetch Batches
                const [batches] = await db.query(
                    `SELECT batch_no, qty, location FROM product_batches WHERE product_id = ?`,
                    [item.productId]
                );
                item.batches = batches;
                item.currentStock = batches.reduce((s, b) => s + b.qty, 0);
            }
            q.items = items;
        }

        res.json({
            success: true,
            quotations,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
                limit
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getArchitectQuotations = async (req, res) => {
    try {
        const { architectId } = req.params; // Get ID from URL

        const [quotations] = await db.query(
            `SELECT * FROM quotations WHERE architect = ? ORDER BY id DESC`,
            [architectId]
        );

        for (let q of quotations) {
            const [items] = await db.query(
                `SELECT qi.*, p.name AS productName
                 FROM quotation_items qi
                 LEFT JOIN products p ON p.id = qi.productId
                 WHERE qi.quotationId = ?`,
                [q.id]
            );

            // ... (Your existing logic for delivery challans and batches) ...
            // This remains the same as your provided code
            q.items = items;
        }

        res.json({ success: true, quotations });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.settleCommission = async (req, res) => {
    const { quotationId, architectId, commissionAmount } = req.body;

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        // 🔥 Add this line to make sure the table is created before the INSERT runs
        await ensureTablesExist(conn);

        // 1. Mark quotation as settled 
        await conn.query(
            `UPDATE quotations SET isSettled = TRUE, commissionAmount = ? WHERE id = ?`,
            [commissionAmount, quotationId]
        );

        // 2. Insert into the ledger/history table
        await conn.query(
            `INSERT INTO architect_ledger (architectId, quotationId, commissionAmount) 
             VALUES (?, ?, ?)`,
            [architectId, quotationId, commissionAmount]
        );

        await conn.commit();
        res.json({ success: true, message: "Commission settled successfully!" });

    } catch (err) {
        await conn.rollback();
        console.error("Settlement Error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        conn.release();
    }
};
exports.getArchitectLedger = async (req, res) => {
    // Change 'id' to 'architectId' to match router.get("/.../:architectId")
    let { architectId } = req.params;

    if (!architectId || architectId === 'undefined') {
        return res.status(400).json({ success: false, error: "Valid ID required" });
    }

    try {
        const [rows] = await db.query(`
            SELECT 
                al.id, al.quotationId, al.commissionAmount, al.settledAt,
                q.clientName, q.grandTotal as quotationTotal
            FROM architect_ledger al
            JOIN quotations q ON al.quotationId = q.id
            WHERE CAST(al.architectId AS CHAR) = CAST(? AS CHAR)
            ORDER BY al.settledAt DESC
        `, [architectId]); // Use architectId here

        res.json({ success: true, history: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
// exports.printQuotation = async (req, res) => {
//     const { id } = req.params;

//     try {
//         // FETCH QUOTATION MASTER
//         const [[quotation]] = await db.query(
//             `SELECT * FROM quotations WHERE id = ?`,
//             [id]
//         );

//         // FETCH ITEMS
//         const [items] = await db.query(
//             `SELECT qi.*, p.name as productName, p.image as productImage
//        FROM quotation_items qi
//        JOIN products p ON p.id = qi.productId
//        WHERE quotationId = ?`,
//             [id]
//         );

//         quotation.items = items;

//         // ---------------- HTML QUOTATION DESIGN (MATCHED WITH YOUR SCREENSHOT) ---------------- //
//         let itemRows = items
//             .map(
//                 (it, i) => `
//       <tr>
//         <td>${i + 1}</td>
//         <td>${it.productId}</td>
//         <td>${it.size}</td>
//         <td><img src="http://localhost:5000/uploads/${it.productImage}" width="50"/></td>
//         <td>${it.quality}</td>
//         <td>${it.rate}</td>
//         <td>${it.discount}</td>
//         <td>${it.box}</td>
//         <td>${it.area}</td>
//         <td>${it.total}</td>
//       </tr>
//     `
//             )
//             .join("");

//         const html = `
//     <html>
//     <head>
//     <style>
//       body { font-family: Arial; padding: 20px; }

//       .header-box {
//         border: 1px solid #000;
//         padding: 10px;
//       }

//       .company-info { float:left; width:70%; }
//       .logo-box { float:right; width:30%; text-align:right; }

//       .title {
//         text-align:center;
//         font-size:22px;
//         margin:20px 0;
//         font-weight:bold;
//         text-decoration:underline;
//       }

//       table { width:100%; border-collapse:collapse; margin-top:10px; }
//       td, th { border:1px solid #000; padding:6px; font-size:14px; text-align:center; }

//       .terms-box { margin-top:20px; line-height:1.5; }

//       .sign {
//         margin-top: 40px;
//         float:right;
//         text-align:center;
//       }
//     </style>
//     </head>

//     <body>

//       <!-- COMPANY HEADER -->
//       <div class="header-box">
//         <div class="company-info">
//             <b>THE CERAMIC STUDIO</b><br>
//             Shop no. 18, Business Bay, Mumbai Naka, Nashik - 422002<br>
//             Contact: 8847788888 / 7085899999<br>
//             Email: support@theceramicstudio.in
//         </div>
//         <div class="logo-box">
//            <img src="http://localhost:5000/assets/tcslog.png" style="width:160px; height:120px; object-fit:contain;" />

//         </div>
//         <div style="clear:both;"></div>
//       </div>

//       <div class="title">Quotation</div>

//       <!-- CLIENT DETAILS -->
//       <table>
//         <tr>
//           <td><b>To</b></td>
//           <td>${quotation.clientName}</td>
//           <td><b>Date</b></td>
//           <td>${new Date(quotation.createdAt).toLocaleDateString()}</td>
//         </tr>

//         <tr>
//           <td><b>Mobile</b></td>
//           <td>${quotation.contactNo}</td>
//           <td><b>Email</b></td>
//           <td>${quotation.email}</td>
//         </tr>

//         <tr>
//           <td><b>Attended By</b></td>
//           <td>${quotation.attendedBy}</td>
//           <td><b>Architect</b></td>
//           <td>${quotation.architect}</td>
//         </tr>
//       </table>

//       <p style="margin-top:15px;">
//         This is with reference to our discussion with you regarding your requirement;
//         here we quote our best price for your prestigious project as below:
//       </p>

//       <!-- PRODUCT TABLE -->
//       <table>
//         <thead>
//           <tr>
//             <th>SrNo</th>
//             <th>Code</th>
//             <th>Size</th>
//             <th>Image</th>
//             <th>Quality</th>
//             <th>Rate</th>
//             <th>Dis</th>
//             <th>Box</th>
//             <th>Area</th>
//             <th>Amount</th>
//           </tr>
//         </thead>

//         <tbody>
//          ${itemRows}
//         </tbody>

//         <tfoot>
//           <tr>
//             <td colspan="9" style="text-align:right;"><b>Total</b></td>
//             <td><b>${quotation.grandTotal}</b></td>
//           </tr>
//         </tfoot>
//       </table>

//       <!-- TERMS -->
//       <div class="terms-box">
//         ${quotation.bottomSection}
//       </div>

//       <div class="sign">
//          <b>For THE CERAMIC STUDIO</b><br><br><br>
//          _______________________<br>
//          Authorized Signature
//       </div>

//     </body>
//     </html>
//     `;

//         // ---------------- GENERATE PDF ---------------- //
//         const browser = await puppeteer.launch({
//             headless: "new",
//             args: ["--no-sandbox"],
//         });
//         const page = await browser.newPage();

//         await page.setContent(html, { waitUntil: "networkidle0" });

//         const pdf = await page.pdf({
//             format: "A4",
//             printBackground: true,
//             margin: { top: "10mm", bottom: "10mm" },
//         });

//         await browser.close();

//         res.set({
//             "Content-Type": "application/pdf",
//             "Content-Length": pdf.length,
//             "Content-Disposition": `attachment; filename=Quotation_${id}.pdf`,
//         });

//         return res.send(pdf);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// };
// exports.printQuotation = async (req, res) => {
//     const { id } = req.params;
//     const { mode } = req.query;

//     try {
//         const [[quotation]] = await db.query(`SELECT * FROM quotations WHERE id = ?`, [id]);
//         if (!quotation) return res.status(404).json({ error: "Quotation not found" });

//         const [items] = await db.query(
//             `SELECT qi.*, p.name AS productName, p.image AS productImage
//              FROM quotation_items qi
//              JOIN products p ON p.id = qi.productId
//              WHERE quotationId = ?`, [id]
//         );

//         const codeHeaderLabel = mode === "qname" ? "Product Name" : "Code";

//         const itemRows = items.map((it, i) => {
//             const discountPercent = parseFloat(it.discount || 0);
//             const rate = parseFloat(it.rate || 0);
//             const discountAmt = (rate * discountPercent) / 100;
//             return `
//                 <tr>
//                   <td>${i + 1}</td>
//                   <td>${mode === "qname" ? it.productName : it.productId}</td>
//                   <td>${it.size}</td>
//                   <td class="img-cell"><img src="https://dashboard.theceramicstudio.in/uploads/${it.productImage}" /></td>
//                   <td>${it.quality}</td>
//                   <td>${rate.toFixed(2)}</td>
//                   <td>${it.discount}</td>
//                   <td>${discountAmt.toFixed(2)}</td>
//                   <td>${it.box}</td>
//                   <td>${it.area}</td>
//                   <td>${parseFloat(it.total).toFixed(2)}</td>
//                 </tr>`;
//         }).join("");

//         const html = `
//     <html>
//     <head>
//       <style>
//         @page { size: A4; margin: 10mm; }
//         body { 
//             font-family: 'Arial', sans-serif; 
//             margin: 0; 
//             padding: 0 30px; 
//             color: #000; 
//             font-size: 13px; /* Increased base font size */
//             line-height: 1.5; 
//         }

//         .header-section { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
//         .logo { width: 100px; height: auto; margin-bottom: 5px; }
//         .address { font-size: 11px; font-weight: bold; line-height: 1.3; }

//         .title-box { text-align: center; margin: 15px 0; }
//         .title-text { font-size: 20px; font-weight: bold; text-decoration: underline; text-transform: uppercase; }

//         .meta-container { width: 100%; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 10px 0; margin-bottom: 15px; }
//         .meta-table { width: 100%; border-collapse: collapse; }
//         .meta-table td { padding: 3px 0; font-size: 13px; }
//         .bold { font-weight: bold; }

//         .main-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 10px 0; }
//         .main-table th, .main-table td { 
//             border: 1px solid #000; 
//             padding: 6px 2px; 
//             font-size: 11.5px; /* Increased table font size */
//             text-align: center; 
//             word-wrap: break-word; 
//         }
//         .main-table th { background: #f2f2f2; font-weight: bold; }

//         /* Column widths to keep table from being too broad */
//         .w-sr { width: 35px; } 
//         .w-img { width: 65px; } 
//         .w-dis { width: 35px; } 
//         .w-box { width: 45px; }
//         .img-cell img { width: 55px; height: 55px; object-fit: contain; display: block; margin: 0 auto; }

//         .summary-row td { text-align: right; font-weight: bold; padding: 8px 10px; font-size: 12px; }

//         .terms-box { margin-top: 25px; font-size: 12px; line-height: 1.6; }
//         .footer-sign { margin-top: 50px; width: 100%; }
//         .sign-area { float: right; text-align: center; width: 250px; font-size: 13px; font-weight: bold; }
//       </style>
//     </head>
//     <body>

//       <div class="header-section">
//         <img src="https://dashboard.theceramicstudio.in/assets/tcslog.png" class="logo" />
//         <div class="address">
//           Shop no. 18, Business Bay, Shree Hari Kute Marg, Tidke Colony, Mumbai Naka, Nashik - 422002<br>
//           Contact: 8847788888, 7058859999, Email: support@theceramicstudio.in
//         </div>
//       </div>

//       <div class="title-box">
//         <span class="title-text">Quotation</span>
//       </div>

//       <div class="meta-container">
//         <table class="meta-table">
//           <tr>
//             <td style="width: 12%;" class="bold">To,</td>
//             <td style="width: 48%;" class="bold">${quotation.clientName} (${quotation.contactNo})</td>
//             <td style="width: 12%;" class="bold">Date :</td>
//             <td style="width: 28%;">${new Date(quotation.createdAt).toLocaleDateString('en-GB')}</td>
//           </tr>
//           <tr>
//             <td class="bold">Attended By :</td>
//             <td>${quotation.attendedBy || ''}</td>
//             <td class="bold">Architect :</td>
//             <td>${quotation.architect || ''}</td>
//           </tr>
//         </table>
//       </div>

//       <div style="font-size: 12px; margin: 10px 0;">
//         This is with reference to our discussion with you regarding your requirement; here we quote our best price for your prestigious project as below:
//       </div>

//       <table class="main-table">
//         <thead>
//           <tr>
//             <th class="w-sr">Sr No</th>
//             <th style="width: 70px;">${codeHeaderLabel}</th>
//             <th style="width: 80px;">Size</th>
//             <th class="w-img">Image</th>
//             <th>Quality</th>
//             <th style="width: 55px;">Rate</th>
//             <th class="w-dis">Dis</th>
//             <th style="width: 60px;">DisAmt</th>
//             <th class="w-box">Box</th>
//             <th style="width: 65px;">App. Area</th>
//             <th style="width: 85px;">Amount</th>
//           </tr>
//         </thead>
//         <tbody>
//           ${itemRows}
//           <tr class="summary-row">
//             <td colspan="10">Grand Total</td>
//             <td>${parseFloat(quotation.grandTotal).toFixed(2)}/-</td>
//           </tr>
//           <tr class="summary-row">
//             <td colspan="10">Paidup Amount</td>
//             <td>0/-</td>
//           </tr>
//           <tr class="summary-row">
//             <td colspan="10">Freight Charges</td>
//             <td>/</td>
//           </tr>
//           <tr class="summary-row">
//             <td colspan="10">DueAmount</td>
//             <td>${parseFloat(quotation.grandTotal).toFixed(2)}/-</td>
//           </tr>
//         </tbody>
//       </table>

//       <div class="terms-box">
//         ${quotation.bottomSection}
//       </div>

//       <div class="footer-sign">
//         <div class="sign-area">
//           For THE CERAMIC STUDIO-NASHIK.<br><br><br><br><br>
//           Authorized Signature
//         </div>
//         <div style="clear:both;"></div>
//       </div>

//     </body>
//     </html>`;

//         const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
//         const page = await browser.newPage();
//         await page.setContent(html, { waitUntil: "networkidle0" });

//         const pdf = await page.pdf({
//             format: "A4",
//             printBackground: true,
//             margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" }
//         });

//         await browser.close();
//         res.set({ "Content-Type": "application/pdf", "Content-Length": pdf.length, "Content-Disposition": "inline" });
//         res.send(pdf);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// };

exports.printQuotation = async (req, res) => {
    const { id } = req.params;
    const { mode } = req.query;

    try {
        const [[quotation]] = await db.query(`SELECT * FROM quotations WHERE id = ?`, [id]);
        if (!quotation) return res.status(404).json({ error: "Quotation not found" });

        const [items] = await db.query(
            `SELECT qi.*, p.name AS productName, p.image AS productImage
             FROM quotation_items qi
             JOIN products p ON p.id = qi.productId
             WHERE quotationId = ?`, [id]
        );
        const addDisc = Number(quotation.additionalDiscount || 0);
        const HeaderSection = quotation.headerSection;
        const bottomSection = quotation.bottomSection;
        const codeHeaderLabel = mode === "qname" ? "Product Name" : "Code";

        let runningGrandTotal = 0;
        const itemRows = items.map((it, i) => {
            const discountPercent = parseFloat(it.discount || 0);
            const rate = parseFloat(it.rate || 0);
            // Calculation: Rate minus the percentage discount
            const unitDiscountedPrice = rate - (rate * discountPercent / 100);
            const total = parseFloat(it.total || 0);
            runningGrandTotal += total;

            return `
                <tr>
                  <td style="border:1px solid black;">${i + 1}</td>
                  <td style="border:1px solid black;">${mode === "qname" ? it.productName : it.productId}</td>
                  <td style="border:1px solid black;">${it.size || ''}</td>
                  <td style="border:1px solid black;" class="img-cell">
                    <img src="https://dashboard.theceramicstudio.in/uploads/${it.productImage}" />
                  </td>
                  <td style="border:1px solid black;">${it.quality || ''}</td>
                  <td style="border:1px solid black;">${rate.toFixed(2)}</td>
                  <td style="border:1px solid black;">${discountPercent > 0 ? discountPercent : '-'}</td>
                  <td style="border:1px solid black;">${unitDiscountedPrice.toFixed(2)}</td>
                  <td style="border:1px solid black;">${it.box || ''}</td>
                  <td style="border:1px solid black;">${it.area || ''}</td>
                  <td style="border:1px solid black;">${total.toFixed(2)}</td>
                </tr>`;
        }).join("");

        const html = `
    <html>
    <head>
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 0 20px; color: #000; font-size: 12px; }
        .text-center { text-align: center; }
        .header-section { text-align: center; margin-bottom: 10px; }
        .logo { width: 180px; height: auto; }
        .company-address { font-weight: bold; margin-top: 10px; line-height: 1.4; }
        
        .title-text { font-size: 18px; font-weight: bold; text-decoration: underline; font-style: italic; margin: 15px 0; display: block; }

        .meta-table { width: 100%; margin-bottom: 15px; border-collapse: collapse; }
        .meta-table td { padding: 4px; vertical-align: top; }
        
        .main-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .main-table th, .main-table td { border: 1px solid black; padding: 5px 2px; text-align: center; font-size: 11px; }
        .main-table th { background: #f9f9f9; }
        
        .img-cell img { width: 60px; height: 60px; object-fit: contain; }
        .summary-label { text-align: center; font-weight: bold; }
        
        .terms-section { margin-top: 20px; line-height: 1.5; }
        .bank-details { margin-top: 15px; font-size: 12px; }
        .signature-section { margin-top: 30px; font-weight: bold; }
      </style>
    </head>
    <body>

      <div class="header-section">
        <img src="https://dashboard.theceramicstudio.in/assets/tcslog.png" class="logo" />
        <div class="company-address">
          Shop no. 18, Business Bay, Shree Hari Kute Marg,<br>
          Tidke Colony, Mumbai Naka, Nashik - 422002<br>
          Contact: 8847788888, 7058859999 | Email: support@theceramicstudio.in
        </div>
        <hr style="width: 80%; border: 1px solid #000; margin: 15px auto;">
      </div>

      <div class="text-center">
        <span class="title-text">Quotation</span>
      </div>

      <table class="meta-table">
        <tr>
          <td style="width: 60%;">
            <strong>To,</strong><br>
            &nbsp;&nbsp;&nbsp;&nbsp;${quotation.clientName} (${quotation.contactNo})<br>
           
          </td>
          <td style="width: 40%; text-align: right;">
            <strong>Date:</strong> ${new Date(quotation.createdAt).toLocaleDateString('en-GB')}
          </td>
        </tr>
      </table>

        ${HeaderSection}

      <table class="main-table">
        <thead>
          <tr>
            <th width="3%">Sr No</th>
            <th width="12%">${codeHeaderLabel}</th>
            <th width="10%">Size</th>
            <th width="10%">Image</th>
            <th width="10%">Quality</th>
            <th width="8%">Rate</th>
            <th width="5%">Dis</th>
            <th width="8%">DisAmt</th>
            <th width="8%">Box</th>
            <th width="10%">App. Area</th>
            <th width="12%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          <tr>
            <td colspan="10" class="summary-label">Grand Total</td>
            <td>${runningGrandTotal.toFixed(2)}/-</td>
          </tr>
          ${addDisc > 0 ? `
          <tr>
            <td colspan="10" class="summary-label">Additional Discount</td>
            <td class="summary-value">${addDisc.toFixed(2)} %</td>
          </tr>` : ''}
          <tr>
          ${quotation.discount && quotation.discount > 0 ? `
          <tr>
            <td colspan="10" class="summary-label">Discount (${quotation.discount}%)</td>
            <td>${quotation.discountedAmt}/-</td>
          </tr>` : ''}
          <tr>
            <td colspan="10" class="summary-label">Paidup Amount</td>
            <td>${(quotation.total_paid || 0).toFixed(2)}/-</td>
          </tr>
          <tr>
            <td colspan="10" class="summary-label">Freight Charges</td>
            <td>${(quotation.freight_charges || 0).toFixed(2)}/-</td>
          </tr>
          <tr>
            <td colspan="10" class="summary-label">Due Amount</td>
            <td style="background: #eee; font-weight: bold;">${Number(quotation.due_amount || 0).toFixed(2)}/-</td>
          </tr>
        </tbody>
      </table>

      <div class="terms-section">
        ${HeaderSection}
        
         ${bottomSection}
      </div>

    </body>
    </html>`;

        const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });

        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" }
        });

        await browser.close();
        res.set({ "Content-Type": "application/pdf", "Content-Length": pdf.length, "Content-Disposition": "inline" });
        res.send(pdf);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.generateDeliveryChallan = async (req, res) => {
    const { quotationId, client, contact, address, driverDetails, items } = req.body;
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {


        // 2️⃣ Insert Master Record
        const [challan] = await conn.query(
            `INSERT INTO delivery_challan (quotationId, client, contact, address, deliveryBoy, driverContact, tempo) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [quotationId, client, contact, address, driverDetails.deliveryBoy, driverDetails.contact, driverDetails.tempo]
        );
        const challanId = challan.insertId;

        // 3️⃣ Process Products
        // for (let p of items) {
        //     // ⭐ AUTOMATIC QTY CALCULATION
        //     // We fetch the 'cov' from quotation_items to convert Boxes -> Qty
        //     const [[itemData]] = await conn.query(
        //         `SELECT cov FROM quotation_items WHERE quotationId = ? AND productId = ?`,
        //         [quotationId, p.productId]
        //     );

        //     const dispatchQty = p.dispatchBoxes * (itemData.cov || 0);

        //     // Insert into Challan Items
        //     await conn.query(
        //         `INSERT INTO delivery_challan_items (challanId, productId, productName, dispatchBoxes, dispatchQty, remainingStock) VALUES (?, ?, ?, ?, ?, ?)`,
        //         [challanId, p.productId, p.productName, p.dispatchBoxes, dispatchQty, p.remainingStock]
        //     );

        //     // 🔥 FIFO Stock Deduction from Batches (Qty based)
        //     let remainingToDeduct = dispatchQty;
        //     const [batches] = await conn.query(
        //         `SELECT id, qty FROM product_batches WHERE product_id = ? AND qty > 0 ORDER BY batch_no ASC`,
        //         [p.productId]
        //     );

        //     for (let b of batches) {
        //         if (remainingToDeduct <= 0) break;
        //         let deduct = Math.min(b.qty, remainingToDeduct);
        //         await conn.query(`UPDATE product_batches SET qty = qty - ? WHERE id = ?`, [deduct, b.id]);
        //         remainingToDeduct -= deduct;
        //     }

        //     // ⚡ Update Product Master Total (Box based deduction for availQty)
        //     await conn.query(
        //         `UPDATE products SET availQty = availQty - ? WHERE id = ?`,
        //         [p.dispatchBoxes, p.productId]
        //     );

        //     // ⚡ Update Quotation Progress (Qty based)
        //     await conn.query(
        //         `UPDATE quotation_items SET weight = weight + ? WHERE quotationId = ? AND productId = ?`,
        //         [dispatchQty, quotationId, p.productId]
        //     );
        // }

        for (let p of items) {

            if (!p.dispatchBoxes || p.dispatchBoxes <= 0) continue;

            const [[itemData]] = await conn.query(
                `SELECT cov FROM quotation_items WHERE quotationId = ? AND productId = ?`,
                [quotationId, p.productId]
            );

            const dispatchQty = p.dispatchBoxes * itemData.cov;

            await conn.query(
                `INSERT INTO delivery_challan_items 
        (challanId, productId, productName, dispatchBoxes, dispatchQty, remainingStock) 
        VALUES (?, ?, ?, ?, ?, ?)`,
                [challanId, p.productId, p.productName, p.dispatchBoxes, dispatchQty, p.remainingStock]
            );

            // FIFO batch deduction
            let remainingToDeduct = dispatchQty;
            const [batches] = await conn.query(
                `SELECT id, qty FROM product_batches 
         WHERE product_id = ? AND qty > 0 
         ORDER BY batch_no ASC`,
                [p.productId]
            );

            for (let b of batches) {
                if (remainingToDeduct <= 0) break;
                const deduct = Math.min(b.qty, remainingToDeduct);
                await conn.query(
                    `UPDATE product_batches SET qty = qty - ? WHERE id = ?`,
                    [deduct, b.id]
                );
                remainingToDeduct -= deduct;
            }

            // Box based deduction
            await conn.query(
                `UPDATE products SET availQty = availQty - ? WHERE id = ?`,
                [p.dispatchBoxes, p.productId]
            );

            // Quotation progress
            await conn.query(
                `UPDATE quotation_items 
         SET weight = weight + ? 
         WHERE quotationId = ? AND productId = ?`,
                [dispatchQty, quotationId, p.productId]
            );
        }

        await conn.commit();
        res.json({ success: true, challanId, message: "Delivery Challan Generated Successfully!" });

    } catch (err) {
        await conn.rollback();
        console.error("DC Error:", err);
        res.status(500).json({ success: false, error: err.message });
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
        // FETCH MASTER DATA
        const [[challan]] = await db.query(
            `SELECT * FROM delivery_challan WHERE id = ?`,
            [challanId]
        );

        if (!challan)
            return res.status(404).json({ success: false, message: "Challan not found" });

        // FETCH ITEMS DATA
        const [items] = await db.query(
            `SELECT dci.*, p.name AS productName, p.size, p.quality, p.rate
             FROM delivery_challan_items dci
             LEFT JOIN products p ON p.id = dci.productId
             WHERE challanId = ?`,
            [challanId]
        );

        // ITEM ROWS
        const itemRows = items.map((it, i) => `
            <tr>
                <td style="text-align: center;">${i + 1}</td>
                <td style="text-align: left; padding-left: 10px;">${it.productName}</td>
                <td style="text-align: center;">${it.dispatchBoxes}</td>
                <td style="text-align: center;">${it.rate}</td>
                <td style="text-align: center;">${(it.rate * it.dispatchBoxes).toFixed(2)}</td>
            </tr>
        `).join("");

        // Fill remaining rows to maintain consistent table height (matching physical book style)
        const emptyRows = Array(Math.max(0, 15 - items.length))
            .fill('<tr><td style="height:28px;">&nbsp;</td><td></td><td></td><td></td><td></td></tr>')
            .join("");

        const totalAmt = items.reduce((t, a) => t + (a.dispatchBoxes * a.rate), 0).toFixed(2);

        const html = `
<!DOCTYPE html>
<html>
<head>
<style>
    @page { size: A4; margin: 0; }
    body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; color: #000; }
    
    .page { 
        width: 210mm; 
        height: 297mm; 
        padding: 12mm; 
        box-sizing: border-box; 
        position: relative; 
        page-break-after: always; 
    }
    
    /* Header Styles */
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    .simpolo-logo { width: 130px; }
    .business-info { text-align: center; }
    .business-name { font-size: 28px; font-weight: bold; margin: 0; }
    .dc-box { border: 1.5px solid #000; padding: 5px; text-align: center; font-size: 11px; width: 160px; }
    .challan-no { color: #d32f2f; font-size: 18px; font-weight: bold; }

    /* Meta Info (Customer details) */
    .meta-section { margin: 20px 0; font-size: 15px; }
    .meta-row { display: flex; align-items: flex-end; margin-bottom: 10px; }
    .field-line { border-bottom: 1px solid #000; flex-grow: 1; margin-left: 8px; padding-bottom: 2px; min-height: 20px; }

    /* Main Product Table */
    .grid-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; }
    .grid-table th, .grid-table td { border: 1px solid #000; padding: 6px; font-size: 14px; }
    .grid-table th { background: #f2f2f2; text-transform: uppercase; }

    /* Bottom Summary & Terms */
    .footer-container { display: flex; justify-content: space-between; margin-top: 20px; }
    .terms-text { width: 62%; font-size: 12px; line-height: 1.6; }
    .summary-table { width: 34%; border-collapse: collapse; }
    .summary-table td { border: 1px solid #000; padding: 8px; text-align: right; font-size: 14px; }

    .sig-area { margin-top: 60px; display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; }
    
    /* Instruction Page Styles */
    .instruction-body { padding: 40px; font-size: 18px; line-height: 2.2; }
    .instruction-header { text-align: center; text-decoration: underline; font-size: 30px; margin-bottom: 30px; font-weight: bold; }
</style>
</head>
<body>

<div class="page">
    <table class="header-table">
        <tr>
            <td width="20%"><img src="https://dashboard.theceramicstudio.in/uploads" /></td>
            <td class="business-info">
                <h1 class="business-name">The Ceramic Studio</h1>
                <div style="font-size: 11px; font-weight: bold;">
                    Shop No. 18, Business Bay, Shrihari Kute Marg, Tidke Colony,<br>
                    Mumbai Naka, Nashik - 422 002. Tel: 8847788888 / 7058859999<br>
                    GSTIN: 27ASAPD5699N1Z5 | RTGS / NEFT IFSC - YESB0000021
                </div>
            </td>
            <td width="25%" align="right">
                <div class="dc-box">
                    <b>Delivery Challan<br>Cum Estimate</b><br>
                    <span class="challan-no">No.: ${challan.id}</span>
                </div>
            </td>
        </tr>
    </table>

    <div class="meta-section">
        <div class="meta-row">M/s. <div class="field-line"><b>${challan.client}</b></div></div>
        <div style="display: flex; gap: 30px;">
            <div class="meta-row" style="flex: 2;">By <div class="field-line">${challan.deliveryBoy}</div></div>
            <div class="meta-row" style="flex: 1;">Date: <div class="field-line">${new Date(challan.createdAt).toLocaleDateString('en-GB')}</div></div>
        </div>
        <div style="display: flex; gap: 20px;">
            <div class="meta-row" style="flex: 1.5;">P.O. No. <div class="field-line">${challan.quotationId}</div></div>
            <div class="meta-row" style="flex: 1;">Date: <div class="field-line">/ /20</div></div>
            <div class="meta-row" style="flex: 1;">Payment <div class="field-line"></div></div>
            <div class="meta-row" style="flex: 0.5;">Days <div class="field-line"></div></div>
        </div>
    </div>

    <table class="grid-table">
        <thead>
            <tr>
                <th width="8%">Sr. No.</th>
                <th width="50%">Product</th>
                <th width="12%">Box Qty.</th>
                <th width="12%">Rate</th>
                <th width="18%">Amount</th>
            </tr>
        </thead>
        <tbody>
            ${itemRows}
            ${emptyRows}
        </tbody>
    </table>

    <div class="footer-container">
        <div class="terms-text">
            <b>Terms :</b> <br>
            ■ All goods are delivered in good conditions.<br>
            ■ Our Responsibility ceases once product/goods have left our premises.<br>
            ■ Goods once sold will not be taken back.<br>
            ■ No complaint regarding rates will be entertained.<br>
            ■ Interest @ 24% per annum will be charged, if Payment not received within 30 days.
        </div>
        <table class="summary-table">
            <tr><td>Carting</td><td>-</td></tr>
            <tr><td>Total</td><td>${totalAmt}</td></tr>
            <tr><td>GST</td><td>-</td></tr>
            <tr style="background:#eee; font-weight:bold;"><td>Grand Total</td><td>${totalAmt}/-</td></tr>
        </table>
    </div>

    <div class="sig-area">
        <div>Receiver's Signature</div>
        <div>For The Ceramic Studio</div>
    </div>
</div>

<div class="page">
    <h2 class="instruction-header">* सूचना *</h2>
    <div class="instruction-body">
        १) टाईल्स लावण्यापूर्वी बॉक्सवरील सूचना वाचव्यात व नंतर टाईल्स फिटींग करणे.<br>
        २) टाईल्स लावण्यापूर्वी तपासून पहाव्या व टाईल्स मध्ये फरक आढळल्यास टाईल्स लावण्यापूर्वी बदलून मिळतील किंवा परत घेतल्या जातील. टाईल्स लावल्यानंतर कोणतीही तक्रार कंपनी मान्य करीत नाही.<br>
        ३) टाईल्स मध्ये लॉट बदलल्यास फरक येऊ शकतो. तरी टाईल्स कमी पडल्यास नंतर घेतलेल्या टाईल्स अगोदर लावलेल्या टाईल्स बरोबर मॅच करून पहाव्यात व नंतर फिटींग करावे.<br>
        ४) टाईल्स फिटींग करतेवेळी स्पेसर लावणे जरुरी आहे.<br>
        ५) टाईल्स फिटींग करण्यापूर्वी टाईल्सच्या पाठीमागील ॲरो " ↑ " पाहूनच फिटींग करावी.<br>
        ६) राहिलेले टाईल्स बॉक्स परत घेतले जाणार नाही.<br>
        ७) ऑर्डर देण्यापूर्वी क्वॉन्टीटी (Quantity) चेक करून ऑर्डर देणे.<br>
        ८) सर्व भांडे (Sanitary Ware) माल उतरवताना चेक करून घेणे. नंतर कोणतीही तक्रार ऐकली जाणार नाही.<br>
        ९) ३% ब्रेकेज ट्रान्सपोर्ट मध्ये होऊ शकतो, त्यामुळे ३% ब्रेकेज गृहीत धरावे. त्यापेक्षा जास्त ब्रेकेज असल्यास तेवढा माल बदलून मिळेल.
    </div>
</div>

</body>
</html>
`;

        const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });

        // Generate PDF spanning both pages
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true
        });

        await browser.close();

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename=DC_${challanId}.pdf`,
        });

        res.send(pdf);

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};


exports.printDeliveryChallan2 = async (req, res) => {
    const { challanId } = req.params;

    try {
        // FETCH MASTER DATA
        const [[challan]] = await db.query(
            `SELECT * FROM delivery_challan WHERE id = ?`,
            [challanId]
        );

        if (!challan)
            return res.status(404).json({ success: false, message: "Challan not found" });

        // FETCH ITEMS DATA
        const [items] = await db.query(
            `SELECT dci.*, p.name AS productName, p.size, p.quality, p.rate
             FROM delivery_challan_items dci
             LEFT JOIN products p ON p.id = dci.productId
             WHERE challanId = ?`,
            [challanId]
        );

        // ITEM ROWS
        const itemRows = items.map((it, i) => `
            <tr>
                <td style="text-align: center;">${i + 1}</td>
                <td style="text-align: left; padding-left: 10px;">${it.productName}</td>
                <td style="text-align: center;">${it.dispatchBoxes}</td>
                <td style="text-align: center;">${it.rate}</td>
                <td style="text-align: center;">${(it.rate * it.dispatchBoxes).toFixed(2)}</td>
            </tr>
        `).join("");

        // Fill remaining rows to maintain consistent table height (matching physical book style)
        const emptyRows = Array(Math.max(0, 15 - items.length))
            .fill('<tr><td style="height:28px;">&nbsp;</td><td></td><td></td><td></td><td></td></tr>')
            .join("");

        const totalAmt = items.reduce((t, a) => t + (a.dispatchBoxes * a.rate), 0).toFixed(2);

        const html = `
<!DOCTYPE html>
<html>
<head>
<style>
    @page { size: A4; margin: 0; }
    body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; color: #000; }
    
    .page { 
        width: 210mm; 
        height: 297mm; 
        padding: 12mm; 
        box-sizing: border-box; 
        position: relative; 
        page-break-after: always; 
        background: #FFD1DC;
    }
    
    /* Header Styles */
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    .simpolo-logo { width: 130px; }
    .business-info { text-align: center; }
    .business-name { font-size: 28px; font-weight: bold; margin: 0; }
    .dc-box { border: 1.5px solid #000; padding: 5px; text-align: center; font-size: 11px; width: 160px; }
    .challan-no { color: #d32f2f; font-size: 18px; font-weight: bold; }

    /* Meta Info (Customer details) */
    .meta-section { margin: 20px 0; font-size: 15px; }
    .meta-row { display: flex; align-items: flex-end; margin-bottom: 10px; }
    .field-line { border-bottom: 1px solid #000; flex-grow: 1; margin-left: 8px; padding-bottom: 2px; min-height: 20px; }

    /* Main Product Table */
    .grid-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; }
    .grid-table th, .grid-table td { border: 1px solid #000; padding: 6px; font-size: 14px; }
    .grid-table th { background: #f2f2f2; text-transform: uppercase; }

    /* Bottom Summary & Terms */
    .footer-container { display: flex; justify-content: space-between; margin-top: 20px; }
    .terms-text { width: 62%; font-size: 12px; line-height: 1.6; }
    .summary-table { width: 34%; border-collapse: collapse; }
    .summary-table td { border: 1px solid #000; padding: 8px; text-align: right; font-size: 14px; }

    .sig-area { margin-top: 60px; display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; }
    
    /* Instruction Page Styles */
    .instruction-body { padding: 40px; font-size: 18px; line-height: 2.2; }
    .instruction-header { text-align: center; text-decoration: underline; font-size: 30px; margin-bottom: 30px; font-weight: bold; }
</style>
</head>
<body>

<div class="page">
    <table class="header-table">
        <tr>
            <td width="20%"><img src="https://dashboard.theceramicstudio.in/uploads" /></td>
            <td class="business-info">
                <h1 class="business-name">The Ceramic Studio</h1>
                <div style="font-size: 11px; font-weight: bold;">
                    Shop No. 18, Business Bay, Shrihari Kute Marg, Tidke Colony,<br>
                    Mumbai Naka, Nashik - 422 002. Tel: 8847788888 / 7058859999<br>
                    GSTIN: 27ASAPD5699N1Z5 | RTGS / NEFT IFSC - YESB0000021
                </div>
            </td>
            <td width="25%" align="right">
                <div class="dc-box">
                    <b>Delivery Challan<br>Cum Estimate</b><br>
                    <span class="challan-no">No.: ${challan.id}</span>
                </div>
            </td>
        </tr>
    </table>

    <div class="meta-section">
        <div class="meta-row">M/s. <div class="field-line"><b>${challan.client}</b></div></div>
        <div style="display: flex; gap: 30px;">
            <div class="meta-row" style="flex: 2;">By <div class="field-line">${challan.deliveryBoy}</div></div>
            <div class="meta-row" style="flex: 1;">Date: <div class="field-line">${new Date(challan.createdAt).toLocaleDateString('en-GB')}</div></div>
        </div>
        <div style="display: flex; gap: 20px;">
            <div class="meta-row" style="flex: 1.5;">P.O. No. <div class="field-line">${challan.quotationId}</div></div>
            <div class="meta-row" style="flex: 1;">Date: <div class="field-line">/ /20</div></div>
            <div class="meta-row" style="flex: 1;">Payment <div class="field-line"></div></div>
            <div class="meta-row" style="flex: 0.5;">Days <div class="field-line"></div></div>
        </div>
    </div>

    <table class="grid-table">
        <thead>
            <tr>
                <th width="8%">Sr. No.</th>
                <th width="50%">Product</th>
                <th width="12%">Box Qty.</th>
                <th width="12%">Rate</th>
                <th width="18%">Amount</th>
            </tr>
        </thead>
        <tbody>
            ${itemRows}
            ${emptyRows}
        </tbody>
    </table>

    <div class="footer-container">
        <div class="terms-text">
            <b>Terms :</b> <br>
            ■ All goods are delivered in good conditions.<br>
            ■ Our Responsibility ceases once product/goods have left our premises.<br>
            ■ Goods once sold will not be taken back.<br>
            ■ No complaint regarding rates will be entertained.<br>
            ■ Interest @ 24% per annum will be charged, if Payment not received within 30 days.
        </div>
        <table class="summary-table">
            <tr><td>Carting</td><td>-</td></tr>
            <tr><td>Total</td><td>${totalAmt}</td></tr>
            <tr><td>GST</td><td>-</td></tr>
            <tr style="background:#eee; font-weight:bold;"><td>Grand Total</td><td>${totalAmt}/-</td></tr>
        </table>
    </div>

    <div class="sig-area">
        <div>Receiver's Signature</div>
        <div>For The Ceramic Studio</div>
    </div>
</div>

<div class="page">
    <h2 class="instruction-header">* सूचना *</h2>
    <div class="instruction-body">
        १) टाईल्स लावण्यापूर्वी बॉक्सवरील सूचना वाचव्यात व नंतर टाईल्स फिटींग करणे.<br>
        २) टाईल्स लावण्यापूर्वी तपासून पहाव्या व टाईल्स मध्ये फरक आढळल्यास टाईल्स लावण्यापूर्वी बदलून मिळतील किंवा परत घेतल्या जातील. टाईल्स लावल्यानंतर कोणतीही तक्रार कंपनी मान्य करीत नाही.<br>
        ३) टाईल्स मध्ये लॉट बदलल्यास फरक येऊ शकतो. तरी टाईल्स कमी पडल्यास नंतर घेतलेल्या टाईल्स अगोदर लावलेल्या टाईल्स बरोबर मॅच करून पहाव्यात व नंतर फिटींग करावे.<br>
        ४) टाईल्स फिटींग करतेवेळी स्पेसर लावणे जरुरी आहे.<br>
        ५) टाईल्स फिटींग करण्यापूर्वी टाईल्सच्या पाठीमागील ॲरो " ↑ " पाहूनच फिटींग करावी.<br>
        ६) राहिलेले टाईल्स बॉक्स परत घेतले जाणार नाही.<br>
        ७) ऑर्डर देण्यापूर्वी क्वॉन्टीटी (Quantity) चेक करून ऑर्डर देणे.<br>
        ८) सर्व भांडे (Sanitary Ware) माल उतरवताना चेक करून घेणे. नंतर कोणतीही तक्रार ऐकली जाणार नाही.<br>
        ९) ३% ब्रेकेज ट्रान्सपोर्ट मध्ये होऊ शकतो, त्यामुळे ३% ब्रेकेज गृहीत धरावे. त्यापेक्षा जास्त ब्रेकेज असल्यास तेवढा माल बदलून मिळेल.
    </div>
</div>

</body>
</html>
`;

        const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });

        // Generate PDF spanning both pages
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true
        });

        await browser.close();

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename=DC_${challanId}.pdf`,
        });

        res.send(pdf);

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};


// ======================= DELETE DELIVERY CHALLAN =======================
exports.deleteDeliveryChallan = async (req, res) => {
    const { challanId } = req.params;

    if (!challanId) {
        return res.status(400).json({
            success: false,
            message: "challanId is required"
        });
    }

    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        // 1️⃣ CHECK IF CHALLAN EXISTS
        const [[challan]] = await conn.query(
            `SELECT id FROM delivery_challan WHERE id = ?`,
            [challanId]
        );

        if (!challan) {
            conn.release();
            return res.status(404).json({
                success: false,
                message: "Delivery Challan not found"
            });
        }

        // 2️⃣ GET ITEMS TO RESTORE STOCK
        const [items] = await conn.query(
            `SELECT productId, dispatchBoxes, dispatchQty FROM delivery_challan_items WHERE challanId = ?`,
            [challanId]
        );

        // 3️⃣ RESTORE STOCK FOR EACH ITEM
        for (let item of items) {
            // Restore box quantity
            await conn.query(
                `UPDATE products SET availQty = availQty + ? WHERE id = ?`,
                [item.dispatchBoxes, item.productId]
            );

            // Restore from product_batches (ADD BACK QTY in FIFO reverse)
            const [batches] = await conn.query(
                `SELECT id, qty FROM product_batches WHERE product_id = ? ORDER BY batch_no DESC LIMIT 1`,
                [item.productId]
            );

            if (batches.length > 0) {
                await conn.query(
                    `UPDATE product_batches SET qty = qty + ? WHERE id = ?`,
                    [item.dispatchQty, batches[0].id]
                );
            }
        }

        // 4️⃣ DELETE CHALLAN ITEMS
        await conn.query(
            `DELETE FROM delivery_challan_items WHERE challanId = ?`,
            [challanId]
        );

        // 5️⃣ DELETE CHALLAN MASTER
        await conn.query(
            `DELETE FROM delivery_challan WHERE id = ?`,
            [challanId]
        );

        await conn.commit();
        res.json({
            success: true,
            message: "Delivery Challan deleted successfully and stock restored!"
        });

    } catch (err) {
        await conn.rollback();
        console.error("Delete DC Error:", err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    } finally {
        conn.release();
    }
};

