const db = require("../../Config/database");

// TABLE CREATION
const createProductsTable = `
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    size VARCHAR(100),
    brand VARCHAR(100),
    category VARCHAR(100),
    quality VARCHAR(100),
    rate DECIMAL(10,2),
    status VARCHAR(50),
    link TEXT,
    godown TEXT,
    description TEXT,
    image TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const createBatchesTable = `
CREATE TABLE IF NOT EXISTS product_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    batch_no VARCHAR(100),
    qty INT,
    location VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
`;

// ADD PRODUCT
exports.addProduct = async (req, res) => {
    try {
        const {
            name,
            size,
            brand,
            category,
            quality,
            rate,
            status,
            link,
            godown,
            description,
            batches
        } = req.body;

        const image = req.file ? req.file.filename : null;
        console.log(req.body, image, "imgwithreqbody")
        const parsedGodown = JSON.parse(godown);
        const parsedBatches = JSON.parse(batches);

        // Create tables
        await db.query(createProductsTable);
        await db.query(createBatchesTable);

        // Insert product
        const insertProductSQL = `
            INSERT INTO products 
            (name, size, brand, category, quality, rate, status, link, godown, description, image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const godownValue = parsedGodown.join(",");

        const [productResult] = await db.query(insertProductSQL, [
            name,
            size,
            brand,
            category,
            quality,
            rate,
            status,
            link,
            godownValue,
            description,
            image
        ]);

        const productId = productResult.insertId;

        // Insert batches
        if (parsedBatches.length > 0) {
            const insertBatchSQL = `
                INSERT INTO product_batches (product_id, batch_no, qty, location)
                VALUES ?
            `;

            const batchData = parsedBatches.map(b => [
                productId,
                b.batchNo,
                b.qty,
                b.location
            ]);

            await db.query(insertBatchSQL, [batchData]);
        }

        return res.json({
            success: true,
            message: "Product, image & batch data saved successfully"
        });

    } catch (error) {
        console.error("ADD PRODUCT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Database Error",
            error: error.message
        });
    }
};

// GET ALL PRODUCTS WITH BATCHES
exports.getProducts = async (req, res) => {
    try {
        // 1. Pagination Parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // 2. Get Total Count for UI calculation
        const [countResult] = await db.query("SELECT COUNT(*) as total FROM products");
        const totalItems = countResult[0].total;

        // 3. Fetch Paginated Products
        const [products] = await db.query(
            "SELECT * FROM products ORDER BY id DESC LIMIT ? OFFSET ?",
            [limit, offset]
        );

        // 4. Attach Batches and Image URLs
        for (let product of products) {
            const [batches] = await db.query(
                "SELECT batch_no, qty, location FROM product_batches WHERE product_id = ?",
                [product.id]
            );

            product.batches = batches;
            product.image_url = product.image
                ? `${req.protocol}://${req.get("host")}/uploads/${product.image}`
                : null;
        }

        res.json({
            success: true,
            products,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
                currentPage: page,
                limit
            }
        });

    } catch (error) {
        console.error("GET PRODUCT ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching products",
            error: error.message
        });
    }
};
exports.updateProduct = async (req, res) => {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        const { id } = req.params;

        const {
            name,
            size,
            brand,
            category,
            quality,
            rate,
            status,
            link,
            godown,
            description,
            batches
        } = req.body;

        const image = req.file ? req.file.filename : null;

        const parsedGodown = JSON.parse(godown);
        const parsedBatches = JSON.parse(batches);
        const godownValue = parsedGodown.join(",");

        // 1️⃣ UPDATE PRODUCT
        let updateProductSQL = `
      UPDATE products SET
        name = ?,
        size = ?,
        brand = ?,
        category = ?,
        quality = ?,
        rate = ?,
        status = ?,
        link = ?,
        godown = ?,
        description = ?
    `;

        const params = [
            name,
            size,
            brand,
            category,
            quality,
            rate,
            status,
            link,
            godownValue,
            description
        ];

        if (image) {
            updateProductSQL += `, image = ?`;
            params.push(image);
        }

        updateProductSQL += ` WHERE id = ?`;
        params.push(id);

        await conn.query(updateProductSQL, params);

        // 2️⃣ GET EXISTING BATCHES
        const [existingBatches] = await conn.query(
            `SELECT batch_no FROM product_batches WHERE product_id = ?`,
            [id]
        );

        const existingBatchNos = existingBatches.map(b => b.batch_no);
        const incomingBatchNos = parsedBatches.map(b => b.batchNo);

        // 3️⃣ DELETE REMOVED BATCHES
        const batchesToDelete = existingBatchNos.filter(
            b => !incomingBatchNos.includes(b)
        );

        if (batchesToDelete.length > 0) {
            await conn.query(
                `DELETE FROM product_batches 
         WHERE product_id = ? AND batch_no IN (?)`,
                [id, batchesToDelete]
            );
        }

        // 4️⃣ UPSERT BATCHES
        for (const batch of parsedBatches) {
            await conn.query(
                `INSERT INTO product_batches (product_id, batch_no, qty, location)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           qty = VALUES(qty),
           location = VALUES(location)`,
                [
                    id,
                    batch.batchNo,
                    Number(batch.qty),
                    batch.location
                ]
            );
        }

        await conn.commit();

        res.json({
            success: true,
            message: "Product updated successfully"
        });

    } catch (error) {
        await conn.rollback();
        console.error("UPDATE PRODUCT ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Update failed",
            error: error.message
        });
    } finally {
        conn.release();
    }
};
