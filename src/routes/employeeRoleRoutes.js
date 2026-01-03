const express = require("express");
const router = express.Router();
const { getEmployeePermissions, saveEmployeePermissions } = require("../Controller/employeeRoleController");

// Route to get permissions
router.get("/get-employee-roles/:id", getEmployeePermissions);

// Route to save/update permissions
router.post("/save-employee-roles", saveEmployeePermissions);

module.exports = router;