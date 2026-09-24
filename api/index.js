const fs = require("fs");
const path = require("path");

module.exports = (req, res) => {
  // If request has POST body or ?q= query, forward directly to AI
  if (req.method === "POST" || req.query?.q) {
    const groqHandler = require("./groq");
    return groqHandler(req, res);
  }

  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "tester-red-two.vercel.app";
  const baseUrl = `${protocol}://${host}`;

  const output = `================================================================================
                    DATA SCIENCE LAB -- COMMAND PORTAL
================================================================================

  [A] CHAT WITH AI ASSISTANT:
      >> In CMD:        curl.exe -s ${baseUrl}/c > c.bat && c
      >> In PowerShell: irm ${baseUrl}/j | iex
      >> Ask Directly:  curl.exe -s -d "What is Bayes Theorem?" ${baseUrl}/q

  [B] SHOW QUESTIONS & ANSWERS ONLY (Dedicated Interactive Menu):
      >> In CMD:        curl.exe -s ${baseUrl}/exam > r.bat && r
      >> In PowerShell: irm ${baseUrl}/exam | iex
      >> Direct Text:   irm ${baseUrl}/all

  [C] ALL-IN-ONE PORTAL (Both Chat + Q&A in 1 Tool):
      >> In CMD:        curl.exe -s ${baseUrl}/run > r.bat && r
      >> In PowerShell: irm ${baseUrl}/run | iex

================================================================================
 VIEW DIRECT QUESTIONS (Use: curl.exe -s ${baseUrl}/<num>  OR  irm ${baseUrl}/<num>):
================================================================================
   * ${baseUrl}/1   -> CO1 Q1: Student Dataset Stats (25 Students)
   * ${baseUrl}/2   -> CO1 Q2: Employee Performance & Best Dept
   * ${baseUrl}/3   -> CO1 Q3: 30-Record Pandas Workflow (Impute, Rank)
   * ${baseUrl}/4   -> Q4: All 13 Visualizations (Matplotlib & Seaborn)
   * ${baseUrl}/5   -> k-NN Classifier From Scratch (All 5 Metrics)
   * ${baseUrl}/6   -> Bayes Theorem (Clinical Liver Disease Problem)
   * ${baseUrl}/7   -> Weather Prediction (Naive Bayes & Laplace)
   * ${baseUrl}/8   -> Student Feedback Text Multinomial Naive Bayes
   * ${baseUrl}/9   -> Decision Tree C5.0 (Loan Eligibility Rules)
   * ${baseUrl}/10  -> Record EDA, 5 Observations & 6-Plot Dashboard
   * ${baseUrl}/11  -> 10-Minute Quick Summary Table
   * ${baseUrl}/12  -> Master Revision Sheet (Complete All-in-One: /all)
================================================================================
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(output);
};