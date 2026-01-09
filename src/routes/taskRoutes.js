const express = require("express");
const router = express.Router();
const taskController = require("../Controller/taskController"); // Adjust path as needed


router.get("/all", taskController.getAllTasks);

// Route to assign a new task to an employee
router.post("/assign", taskController.createTask);


router.get("/employee/:employeeId", taskController.getEmployeeTasks);

// Route to update status and add a mandatory remark
router.put("/update/:taskId", taskController.updateTaskStatus);

router.delete("/:taskId", taskController.deleteTask);


module.exports = router;