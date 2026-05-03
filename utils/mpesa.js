const axios = require('axios');

const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
const passkey = process.env.MPESA_PASSKEY;
const shortcode = process.env.MPESA_SHORTCODE;
const callbackURL = process.env.MPESA_CALLBACK_URL; // e.g., https://your-backend.onrender.com/api/mpesa/callback

const getAccessToken = async () => {
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  try {
    const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: { Authorization: `Basic ${auth}` }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Access token error:', error.response?.data || error.message);
    throw error;
  }
};

const stkPush = async (phoneNumber, amount, accountReference, transactionDesc) => {
  const token = await getAccessToken();
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  
  const data = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phoneNumber,
    PartyB: shortcode,
    PhoneNumber: phoneNumber,
    CallBackURL: callbackURL,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc
  };
  
  try {
    const response = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('STK Push error:', error.response?.data || error.message);
    throw error;
  }
};

module.exports = { getAccessToken, stkPush };