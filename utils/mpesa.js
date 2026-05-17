const axios = require("axios");

const getAccessToken = async () => {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`,
  ).toString("base64");
  const url =
    "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  const res = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return res.data.access_token;
};

const stkPush = async (phoneNumber, amount, accountRef, description) => {
  const token = await getAccessToken();
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`,
  ).toString("base64");
  const data = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(amount),
    PartyA: phoneNumber,
    PartyB: process.env.MPESA_SHORTCODE,
    PhoneNumber: phoneNumber,
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: accountRef,
    TransactionDesc: description,
  };
  const response = await axios.post(
    "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    data,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response.data;
};

module.exports = { stkPush };
