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

CHOOSE AN OPTION:

 [1] CHAT WITH AI ASSISTANT
     Interactive CLI chat to ask any question and get instant code & answers.

     >> To start Chat in CMD:
        curl.exe -s ${baseUrl}/c > c.bat && c

     >> Or ask a single question directly:
        curl.exe -s -d "What is Bayes Theorem?" ${baseUrl}/q


 [2] SHOW QUESTIONS & ANSWERS
     Complete syllabus questions, step-by-step python code, and explanations.

     >> To open Interactive Q&A Menu in CMD:
        curl.exe -s ${baseUrl}/m > m.bat && m

     >> Or view all questions & answers directly:
        curl.exe -s ${baseUrl}/2

================================================================================
 ALL-IN-ONE INTERACTIVE PORTAL (Chat + Q&A in a single command):
 curl.exe -s ${baseUrl}/run > r.bat && r
================================================================================
 QUICK DIRECT ANSWERS:
   * 10-Min Revision Sheet:   curl.exe -s ${baseUrl}/quick
   * CO1 Q1 (Students 25):    curl.exe -s ${baseUrl}/q1
   * CO1 Q2 (Employees 30):   curl.exe -s ${baseUrl}/q2
   * CO1 Q3 (Pandas 30):      curl.exe -s ${baseUrl}/q3
   * Q4 (13 Visualizations):  curl.exe -s ${baseUrl}/viz
   * k-NN From Scratch:       curl.exe -s ${baseUrl}/knn
   * Bayes Theorem Problem:   curl.exe -s ${baseUrl}/bayes
   * Weather Naive Bayes:     curl.exe -s ${baseUrl}/weather
   * Decision Tree (C5.0):    curl.exe -s ${baseUrl}/tree
   * Record EDA & Dashboard:  curl.exe -s ${baseUrl}/eda
================================================================================
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(output);
};