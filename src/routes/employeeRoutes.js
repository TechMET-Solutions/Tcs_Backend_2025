const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const empCtrl = require('../Controller/employeeController');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {

        const uploadPath = path.join(__dirname, '../../uploads/employees');

        // ✅ Ensure directory exists safely
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });
const cpUpload = upload.fields([
    { name: 'aadhar', maxCount: 1 },
    { name: 'pancard', maxCount: 1 },
    { name: 'profile', maxCount: 1 } // <--- Must match formData.append("profile", ...)
]);


router.post('/add', cpUpload, empCtrl.createEmployee);
router.put('/update/:id', cpUpload, empCtrl.updateEmployee);
router.delete('/delete/:id', empCtrl.deleteEmployee);
router.patch('/status/:id', empCtrl.toggleStatus); // ✅ Use PATCH for status
router.get('/list', empCtrl.getEmployees);
router.post("/login", empCtrl.employeeLogin);
router.post('/punch', empCtrl.punchAttendance);
router.get("/status/:id", empCtrl.getLastStatus);

// Attendence
router.post("/punch-in", empCtrl.punchIn);
router.post("/punch-out", empCtrl.punchOut);
router.get("/:employeeId", empCtrl.MonthAttendance);
router.get("/attendance-summary/:employeeId",empCtrl.attendanceSummary);
module.exports = router;