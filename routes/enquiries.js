const express = require('express');
const router = express.Router();
const Enquiry = require('../models/Enquiry');
const { sendEnquiryNotification } = require('../utils/sendEmail');

router.post('/', async (req, res) => {
  try {
    const enquiry = new Enquiry(req.body);
    await enquiry.save();
    await sendEnquiryNotification(enquiry);
    res.status(201).json({ success: true, message: 'Enquiry sent successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;