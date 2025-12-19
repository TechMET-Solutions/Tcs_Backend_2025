const express = require("express");
const router = express.Router();
const {
    createEmployee,
    getEmployees,
    saveEmployeeRoles,
    getEmployeeRoles,
    employeeLogin,
} = require("../Controller/employeeController");

// ✅ CREATE
router.post("/create", createEmployee);

// ✅ LIST
router.get("/list", getEmployees);
router.post("/save", saveEmployeeRoles);
router.get("/:employeeId", getEmployeeRoles);
router.post("/login", employeeLogin);
module.exports = router;
