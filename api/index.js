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
      >> Interactive Terminal Chat:
         curl.exe -s ${baseUrl}/c > c.bat && c

      >> Ask single question directly:
         curl.exe -s -d "What is Bayes Theorem?" ${baseUrl}/q


  [B] ALL-IN-ONE INTERACTIVE PORTAL (Chat + Q&A in 1 Tool):
      >> Launch interactive menu in CMD:
         curl.exe -s ${baseUrl}/run > r.bat && r

================================================================================
 DIRECT QUESTION & ANSWER NUMBERS (View with: curl.exe -s ${baseUrl}/<num>):
================================================================================
   * curl.exe -s ${baseUrl}/1   -> CO1 Q1: Student Dataset Stats (25 Students)
   * curl.exe -s ${baseUrl}/2   -> CO1 Q2: Employee Performance & Best Dept
   * curl.exe -s ${baseUrl}/3   -> CO1 Q3: 30-Record Pandas Workflow (Impute, Rank)
   * curl.exe -s ${baseUrl}/4   -> Q4: All 13 Visualizations (Matplotlib & Seaborn)
   * curl.exe -s ${baseUrl}/5   -> k-NN Classifier From Scratch (All 5 Metrics)
   * curl.exe -s ${baseUrl}/6   -> Bayes Theorem (Clinical Liver Disease Problem)
   * curl.exe -s ${baseUrl}/7   -> Weather Prediction (Naive Bayes & Laplace)
   * curl.exe -s ${baseUrl}/8   -> Student Feedback Text Multinomial Naive Bayes
   * curl.exe -s ${baseUrl}/9   -> Decision Tree C5.0 (Loan Eligibility Rules)
   * curl.exe -s ${baseUrl}/10  -> Record EDA, 5 Observations & 6-Plot Dashboard
   * curl.exe -s ${baseUrl}/11  -> 10-Minute Quick Summary Table
   * curl.exe -s ${baseUrl}/12  -> Master Revision Sheet (Complete All-in-One)
================================================================================
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(output);
};