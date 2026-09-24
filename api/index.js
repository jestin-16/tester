const fs = require("fs");
const path = require("path");

module.exports = (req, res) => {
  if (req.method === "POST" || req.query?.q) {
    const groqHandler = require("./groq");
    return groqHandler(req, res);
  }

  const filesDirectory = path.join(process.cwd(), "files");

  try {
    const files = fs
      .readdirSync(filesDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host || "updates-opal.vercel.app";
    const baseUrl = `${protocol}://${host}`;

    let output = `${baseUrl}\n│\n`;

    // List files
    files.forEach((file, index) => {
      const fileUrl = `${baseUrl}/${encodeURIComponent(file)}`;
      const num = String(index + 1).padStart(2, "0");

      output += `├── ${num} ${file}\n`;
      output += `│      ${fileUrl}\n`;
      output += `│\n`;
    });

    // Add Groq CLI
    const groqNumber = String(files.length + 1).padStart(2, "0");

    output += `└── ${groqNumber} groq\n`;
    output += `       ${baseUrl}/groq\n`;
    output += `                              │\n`;
    output += `                              ▼\n`;
    output += `                         Groq CLI\n`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(output);

  } catch (error) {
    console.error("File listing error:", error);

    return res
      .status(500)
      .send("Unable to read files directory.");
  }
};