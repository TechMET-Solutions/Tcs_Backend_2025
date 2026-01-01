// const express = require("express");
// const router = express.Router();

// const {
//     createArchitect,
//     getArchitects,
// } = require("../Controller/architectController");

// router.post("/create", createArchitect);
// router.get("/list", getArchitects);

// module.exports = router;


const express = require("express");
const router = express.Router();

const {
    createArchitect,
    getArchitects,
    updateArchitect,
    deleteArchitect,
} = require("../Controller/architectController");

// ✅ CREATE
router.post("/create", createArchitect);

// ✅ READ
router.get("/list", getArchitects);

// ✅ UPDATE
router.put("/update/:id", updateArchitect);

// ✅ DELETE
router.delete("/delete/:id", deleteArchitect);

module.exports = router;
