const express = require("express");
const cors = require("cors");
require("dotenv").config();
require("./Config/database");
const app = express();
app.use(cors());
app.use(express.json());
const path = require("path");
app.use("/api/users", require("./src/routes/userRoutes"));
app.use("/api/qualities", require("./src/routes/qualityRoutes"));
app.use("/api/categories", require("./src/routes/categoryRoutes"));
app.use("/api/brands", require("./src/routes/brandRoutes"));
app.use("/api/architects", require("./src/routes/architectRoutes"));
app.use("/api/product", require("./src/routes/productRoutes"))
app.use("/api/purchase", require("./src/routes/purchaseRoutes"));
app.use("/api/Quotation", require("./src/routes/quotationRoutes"));
app.use("/api/tracking", require("./src/routes/trackingRoutes"));
app.use("/api/employees", require("./src/routes/employeeRoutes.js"));
app.use("/api/payment", require("./src/routes/paymentRoutes.js"));
app.use("/api/roles", require("./src/routes/employeeRoleRoutes.js"));
app.use("/api/suppliers", require("./src/routes/supplierRoutes.js"));
app.use("/api/tasks", require("./src/routes/taskRoutes.js"));
app.use("/api/transactions", require("./src/routes/transactionRoutes.js"));
app.use("/api/todo", require("./src/routes/todoRoutes.js"));
app.get("/", (req, res) => {
    res.send("✅ Node.js Server Running...");
});
app.use("/assets", express.static(path.join(__dirname, "src/assets")));
app.use("/uploads", express.static(path.join(__dirname, "./uploads")));

const PORT = process.env.PORT || 5000;

// const DIST_PATH = path.join(__dirname, "../public_html/dist");


// app.use(express.static(DIST_PATH));

// app.get(
//     /^(?!\/(api|assets|uploads|Master|Transactions|Auction|Scheme|bank|account-code|loan-charges|kyc|credit-note|generate-bill|grace-period|roles)).*/,
//     (req, res) => {
//         res.sendFile(path.join(DIST_PATH, "index.html"));
//     }
// );
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
