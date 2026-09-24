#!/usr/bin/env node
/**
 * Cross-platform AI Terminal CLI (Windows / macOS / Linux)
 * Supports Groq (llama, mixtral) & xAI Grok (grok-2)
 *
 * Usage:
 *   node chat.js                  (Interactive REPL)
 *   node chat.js "your question"  (Single question & answer)
 */

const readline = require("readline");
const fs = require("fs");
const path = require("path");

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m"
};

// Find API Key from env, .env, or prompt
function loadApiKey() {
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) {
    return process.env.GROQ_API_KEY.trim();
  }
  if (process.env.XAI_API_KEY && process.env.XAI_API_KEY.trim()) {
    return process.env.XAI_API_KEY.trim();
  }

  // Check local .env file
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...rest] = trimmed.split("=");
        if (k && (k.trim() === "GROQ_API_KEY" || k.trim() === "XAI_API_KEY")) {
          const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
          if (val) return val;
        }
      }
    } catch (_) {}
  }

  return null;
}

function getProvider(apiKey) {
  if (apiKey && apiKey.startsWith("xai-")) {
    return {
      name: "xAI (Grok)",
      baseUrl: "https://api.x.ai/v1",
      defaultModel: process.env.GROQ_MODEL || process.env.XAI_MODEL || "grok-2-latest",
      modelsUrl: "https://api.x.ai/v1/models"
    };
  }
  return {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    modelsUrl: "https://api.groq.com/openai/v1/models"
  };
}

async function callChat(apiKey, messages, model, vercelUrl) {
  // If no local API key, fallback to query hosted Vercel endpoint
  if (!apiKey && vercelUrl) {
    const res = await fetch(`${vercelUrl.replace(/\/$/, "")}/api/groq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Vercel endpoint request failed");
    }
    return data.response;
  }

  const provider = getProvider(apiKey);
  const selectedModel = model || provider.defaultModel;

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: selectedModel,
      messages
    })
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message || data.error || `${provider.name} request failed`;
    throw new Error(msg);
  }

  return data.choices?.[0]?.message?.content || "No response received.";
}

async function fetchModels(apiKey) {
  const provider = getProvider(apiKey);
  try {
    const res = await fetch(provider.modelsUrl, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const data = await res.json();
    return (data.data || [])
      .map((m) => m.id)
      .filter((id) => !id.includes("whisper") && !id.includes("embedding"))
      .sort();
  } catch (_) {
    return [];
  }
}

async function main() {
  let apiKey = loadApiKey();
  let vercelUrl = process.env.VERCEL_URL || "";

  // Check for --url flag
  let filteredArgs = [];
  const rawArgs = process.argv.slice(2);
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === "--url" && rawArgs[i + 1]) {
      vercelUrl = rawArgs[i + 1];
      i++;
    } else if (rawArgs[i].startsWith("--url=")) {
      vercelUrl = rawArgs[i].split("=")[1];
    } else {
      filteredArgs.push(rawArgs[i]);
    }
  }

  // One-shot CLI question if arguments are passed: node chat.js "What is Docker?"
  if (filteredArgs.length > 0) {
    const query = filteredArgs.join(" ");
    if (!apiKey && !vercelUrl) {
      console.error(
        `${colors.red}Error: No API key found in GROQ_API_KEY environment variable or .env file.${colors.reset}\n` +
        `${colors.gray}Tip: You can either set GROQ_API_KEY in .env or pass your Vercel URL: node chat.js --url <your-vercel-url> "${query}"${colors.reset}`
      );
      process.exit(1);
    }
    try {
      const answer = await callChat(
        apiKey,
        [
          { role: "system", content: "You are a concise, helpful terminal assistant." },
          { role: "user", content: query }
        ],
        null,
        vercelUrl
      );
      console.log(answer);
    } catch (err) {
      console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
      process.exit(1);
    }
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (promptText) =>
    new Promise((resolve) => rl.question(promptText, resolve));

  // If no API key found, prompt user
  if (!apiKey && !vercelUrl) {
    console.log(`${colors.cyan}${colors.bold}=== AI Terminal CLI Setup ===${colors.reset}`);
    console.log(`${colors.gray}No local API key was detected in .env or environment.${colors.reset}\n`);
    console.log(`You can either:`);
    console.log(`  1. Enter your Groq (${colors.green}gsk_...${colors.reset}) or Grok (${colors.green}xai-...${colors.reset}) API key`);
    console.log(`  2. Or enter your Vercel URL to query your deployed backend\n`);

    const input = (await ask(`${colors.yellow}Enter API Key or Vercel URL: ${colors.reset}`)).trim();
    if (!input) {
      console.log(`${colors.red}Exiting. Please configure your key in .env or provide one.${colors.reset}`);
      rl.close();
      return;
    }

    if (input.startsWith("http://") || input.startsWith("https://")) {
      vercelUrl = input;
      console.log(`${colors.green}Connecting via Vercel: ${vercelUrl}${colors.reset}\n`);
    } else {
      apiKey = input;
      const saveChoice = (await ask(`Save this key to local .env file? (Y/n): `)).trim().toLowerCase();
      if (saveChoice === "" || saveChoice === "y" || saveChoice === "yes") {
        try {
          fs.writeFileSync(path.join(__dirname, ".env"), `GROQ_API_KEY=${apiKey}\n`, "utf8");
          console.log(`${colors.green}Saved key to local .env (git-ignored).${colors.reset}\n`);
        } catch (e) {
          console.log(`${colors.gray}Could not write .env: ${e.message}${colors.reset}\n`);
        }
      }
    }
  }

  const provider = apiKey ? getProvider(apiKey) : { name: "Vercel Proxy", defaultModel: "remote" };
  let currentModel = provider.defaultModel;

  console.log(`${colors.cyan}=========================================${colors.reset}`);
  console.log(`${colors.green}${colors.bold}          AI Terminal Chat               ${colors.reset}`);
  console.log(`${colors.cyan}=========================================${colors.reset}`);
  console.log(`${colors.gray}Provider: ${provider.name} | Model: ${currentModel}${colors.reset}`);
  console.log(`${colors.gray}Commands: exit, /clear, /model, /help${colors.reset}\n`);

  let messages = [
    {
      role: "system",
      content: "You are a helpful, smart AI assistant running inside a terminal CLI. Keep responses clear and terminal-friendly."
    }
  ];

  while (true) {
    const userInput = (await ask(`${colors.green}${colors.bold}You: ${colors.reset}`)).trim();

    if (!userInput) continue;

    if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit" || userInput.toLowerCase() === "q") {
      console.log(`${colors.yellow}Goodbye!${colors.reset}`);
      break;
    }

    if (userInput === "/clear" || userInput === "/reset") {
      messages = [
        {
          role: "system",
          content: "You are a helpful, smart AI assistant running inside a terminal CLI."
        }
      ];
      console.log(`${colors.yellow}Conversation history cleared.${colors.reset}\n`);
      continue;
    }

    if (userInput === "/help") {
      console.log(`\n${colors.cyan}Available Commands:${colors.reset}`);
      console.log(`  ${colors.bold}exit, quit, q${colors.reset}  - End the chat`);
      console.log(`  ${colors.bold}/clear${colors.reset}         - Clear chat history`);
      console.log(`  ${colors.bold}/model${colors.reset}         - View or switch active model`);
      console.log(`  ${colors.bold}/help${colors.reset}          - Show this help message\n`);
      continue;
    }

    if (userInput === "/model") {
      if (apiKey) {
        process.stdout.write(`${colors.gray}Fetching available models...${colors.reset}\r`);
        const available = await fetchModels(apiKey);
        process.stdout.write("                                \r");
        if (available.length > 0) {
          console.log(`\n${colors.cyan}Available Models:${colors.reset}`);
          available.forEach((m, idx) => {
            const prefix = m === currentModel ? `${colors.green}* ` : "  ";
            console.log(`${prefix}${idx + 1}. ${m}${colors.reset}`);
          });
          const choice = (await ask(`\nSelect model (number or name, press Enter to keep current): `)).trim();
          if (choice) {
            const num = parseInt(choice, 10);
            if (!isNaN(num) && num >= 1 && num <= available.length) {
              currentModel = available[num - 1];
            } else if (available.includes(choice)) {
              currentModel = choice;
            }
            console.log(`${colors.green}Switched to model: ${currentModel}${colors.reset}\n`);
          }
        } else {
          console.log(`${colors.gray}Current model: ${currentModel}${colors.reset}\n`);
        }
      } else {
        console.log(`${colors.gray}Using model on Vercel: ${currentModel}${colors.reset}\n`);
      }
      continue;
    }

    // Add user message to history
    messages.push({ role: "user", content: userInput });

    process.stdout.write(`${colors.gray}AI is thinking...${colors.reset}\r`);

    try {
      const reply = await callChat(apiKey, messages, currentModel, vercelUrl);
      process.stdout.write("                 \r"); // Clear thinking
      console.log(`\n${colors.cyan}${colors.bold}AI: ${colors.reset}${reply}\n`);
      messages.push({ role: "assistant", content: reply });
    } catch (err) {
      process.stdout.write("                 \r");
      console.log(`\n${colors.red}Error: ${err.message}${colors.reset}\n`);
      messages.pop(); // remove last failed message
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error(`${colors.red}Fatal: ${err.message}${colors.reset}`);
  process.exit(1);
});
