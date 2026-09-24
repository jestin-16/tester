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
   * ${baseUrl}/1   -> [CO1 Q1] Student Dataset Stats (25 Students)
   * ${baseUrl}/2   -> [CO1 Q2] Employee Performance Report & Best Department (30 Emps)
   * ${baseUrl}/3   -> [CO1 Q3] 30-Record Pandas Workflow (Clean, Impute, Rank, Export)
   * ${baseUrl}/4   -> [Q4] All 13 Visualization Exercises (Matplotlib & Seaborn)
   * ${baseUrl}/5   -> [Record 1] Exploratory Data Visualization (7 Plots & 5 Observations)
   * ${baseUrl}/6   -> [Record 2] Unified 6-Plot Dashboard & Report
   * ${baseUrl}/7   -> [Record 3] Public Dataset EDA (100+ Records & Insights)
   * ${baseUrl}/8   -> [k-NN] Classification From Scratch (All Metrics, Parts A-E)
   * ${baseUrl}/9   -> [Bayes] Clinical Liver Disease Calculation & Derivation
   * ${baseUrl}/10  -> [Weather] Weather Prediction with Laplace Estimator
   * ${baseUrl}/11  -> [Feedback] Student Feedback Text Multinomial Naive Bayes
   * ${baseUrl}/12  -> [Decision Tree] C5.0 Algorithm (Loan Eligibility & Rules)
   * ${baseUrl}/13  -> [Summary] 10-Minute Final Revision Summary Table
   * ${baseUrl}/14  -> [Master] Complete All-in-One Revision Sheet (/all)
================================================================================
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(output);
};