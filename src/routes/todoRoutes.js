const express = require('express');
const router = express.Router();
const tasks = require("../Controller/todoController");

// Define endpoints
router.get("/getTodo", tasks.getTasksByRole);
router.post("/CreateTodo", tasks.createTask);
router.delete("/Delete/:id", tasks.deleteTask);

module.exports = router;