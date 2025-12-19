const express = require("express");
const router = express.Router();
const customerController = require("../Controller/userController")

router.post("/add", customerController.createCustomer);
router.get("/list", customerController.getCustomers);
router.post("/followup/add", customerController.addFollowup);
router.get("/followups/:id", customerController.getFollowups);

module.exports = router;
