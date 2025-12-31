const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // ✅ Added this to fix your error
const empCtrl = require('../Controller/employeeController');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Path adjusted to your structure: E:\TCS Backend\uploads\employees
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
    { name: 'pancard', maxCount: 1 }
]);

router.post('/add', cpUpload, empCtrl.createEmployee);
router.put('/update/:id', cpUpload, empCtrl.updateEmployee);
router.delete('/delete/:id', empCtrl.deleteEmployee);
router.patch('/status/:id', empCtrl.toggleStatus); // ✅ Use PATCH for status
router.get('/list', empCtrl.getEmployees);

module.exports = router;