const express = require("express");
const router = express.Router();

const {
    createArchitect,
    getArchitects,
} = require("../Controller/architectController");

router.post("/create", createArchitect);
router.get("/list", getArchitects);

module.exports = router;
