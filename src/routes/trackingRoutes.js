const express = require("express");
const router = express.Router();

const {
    getTrackingByChallan,
    addTracking,
    deleteTracking
} = require("../Controller/trackingController");

/**
 * Get tracking list by challan ID
 * GET /api/tracking/:challanId
 */
router.get("/:challanId", getTrackingByChallan);

/**
 * Add tracking status
 * POST /api/tracking
 * body: { challanId, status, trackedAt }
 */
router.post("/", addTracking);

/**
 * Delete tracking step
 * DELETE /api/tracking/:id
 */
router.delete("/:id", deleteTracking);

module.exports = router;
