const fs = require("fs");
const path = require("path");

function getApiKey() {
  if (process.env.GROQ_API_KEY) {
    return process.env.GROQ_API_KEY;
  }

  // Local .env fallback for development/testing
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const [k, ...rest] = line.split("=");
        if (k && k.trim() === "GROQ_API_KEY") {
          return rest.join("=").trim();
        }
      }
    }
  } catch (_) {}

  return null;
}

async function callGroq(apiKey, payload) {
  // Use the requested model, or fallback to a very stable common model
  const model = payload.model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  let messages = [];
  
  // payload.messages is used in the interactive mode
  const payloadMessages = payload.messages || payload;

  if (Array.isArray(payloadMessages)) {
    // If it's an array, it's a chat history
    if (payloadMessages.length > 0 && payloadMessages[0].role !== "system") {
      messages.push({
        role: "system",
        content:
          "You are a helpful AI assistant running inside a terminal CLI. Keep responses clear, concise, and terminal-friendly."
      });
    }
    messages.push(...payloadMessages);
  } else {
    // Single message
    messages = [
      {
        role: "system",
        content:
          "You are a helpful AI assistant running inside a terminal CLI. Keep responses clear, concise, and terminal-friendly."
      },
      {
        role: "user",
        content: typeof payloadMessages === "string" ? payloadMessages : JSON.stringify(payloadMessages)
      }
    ];
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Groq API error:", data);
    const errorMsg = data.error?.message || "Groq API request failed";
    throw new Error(errorMsg);
  }

  return (
    data.choices?.[0]?.message?.content || "No response received."
  );
}

async function parseRequestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      if (req.body.messages) return { messages: req.body.messages, model: req.body.model };
      if (req.body.message) return req.body.message;
      if (req.body.q) return req.body.q;
      const keys = Object.keys(req.body);
      if (keys.length === 1 && req.body[keys[0]] === "") {
        return keys[0];
      }
      return req.body;
    }
    if (typeof req.body === "string") {
      try {
        const json = JSON.parse(req.body);
        if (json.messages) return { messages: json.messages, model: json.model };
        if (json.message) return json.message;
        if (json.q) return json.q;
        return json;
      } catch (_) {}
      return req.body;
    }
    if (Buffer.isBuffer(req.body)) {
      const str = req.body.toString("utf8");
      try {
        const json = JSON.parse(str);
        if (json.messages) return { messages: json.messages, model: json.model };
        if (json.message) return json.message;
        if (json.q) return json.q;
        return json;
      } catch (_) {}
      return str;
    }
  }

  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve("");
      try {
        const json = JSON.parse(raw);
        if (json.messages) return resolve({ messages: json.messages, model: json.model });
        if (json.message) return resolve(json.message);
        if (json.q) return resolve(json.q);
        return resolve(json);
      } catch (_) {}
      resolve(raw);
    });
    req.on("error", reject);
  });
}

function generateCliScript(baseUrl) {
  const systemPrompt = "You are a world-class, elite AI coding agent. When asked to write code, YOU MUST ONLY PROVIDE THE RAW CODE. DO NOT provide explanations. DO NOT provide step-by-step breakdowns. DO NOT wrap the code in markdown blocks. Just return the raw code directly. If asked a non-coding question, answer as concisely as possible with zero conversational filler.";

  return `#!/usr/bin/env bash
# ==============================================================================
# Groq CLI
# ──────────────────────────────────────────────────
# Quick Start:
#   Interactive mode:  curl -sL ${baseUrl}/groq | bash
#   Ask question:      curl -sL "${baseUrl}/groq?q=your+question"
#                      curl -sL -d "your question" ${baseUrl}/groq
# ==============================================================================

set -e

BASE_URL="${baseUrl}"
SYSTEM_PROMPT="${systemPrompt.replace(/"/g, '\\"')}"

# If arguments were passed directly to script
if [ $# -gt 0 ]; then
  QUERY="$*"
  curl -sS -X POST "$BASE_URL/api/groq" \\
    -H "Content-Type: text/plain; charset=utf-8" \\
    --data-binary "$QUERY"
  echo ""
  exit 0
fi

# Ensure jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed."
    echo "Please install it to use interactive mode (e.g., sudo apt install jq)."
    exit 1
fi

# Fetch available models via Vercel
echo "Fetching available models..."
models_json=$(curl -sS "$BASE_URL/api/groq?action=models")
model_list=$(echo "$models_json" | jq -r '.[]' 2>/dev/null)

if [ -z "$model_list" ]; then
    echo "Error: Could not fetch models."
    exit 1
fi

echo "Please select a model to use:"
if [ -e /dev/tty ]; then
  select MODEL in $model_list; do
      if [ -n "$MODEL" ]; then
          break
      else
          echo "Invalid selection. Please try again."
      fi
  done < /dev/tty
else
  # Non-interactive fallback, pick the first one
  for m in $model_list; do
      MODEL=$m
      break
  done
fi

# Print Header
echo "● Groq CLI"
echo "────────────────────────────────────────"
echo "Connected to Groq via Vercel. (Model: $MODEL)"
echo "Type your question and press Enter. (Type 'exit' to quit)"
echo ""

# Helper to read input from terminal even when piped to bash
get_user_input() {
  local prompt="$1"
  if [ -e /dev/tty ]; then
    if ! read -r -p "$prompt" REPLY < /dev/tty; then return 1; fi
    # If the user pasted a multi-line block, the extra lines are already buffered.
    # 'read -t 0' checks if there is more data available immediately without blocking.
    while read -t 0 < /dev/tty; do
      read -r NEXT_LINE < /dev/tty
      REPLY="$REPLY"$'\\n'"$NEXT_LINE"
    done
  elif [ -t 0 ]; then
    if ! read -r -p "$prompt" REPLY; then return 1; fi
    while read -t 0; do
      read -r NEXT_LINE
      REPLY="$REPLY"$'\\n'"$NEXT_LINE"
    done
  else
    return 1
  fi
}

messages=$(jq -n --arg sp "$SYSTEM_PROMPT" '[{"role": "system", "content": $sp}]')

while true; do
  if ! get_user_input "You: "; then
    echo ""
    break
  fi

  # Trim leading and trailing whitespace
  user_input=$(echo "$REPLY" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

  if [ -z "$user_input" ]; then
    continue
  fi

  if [ "$user_input" = "exit" ] || [ "$user_input" = "quit" ] || [ "$user_input" = "q" ]; then
    echo "Goodbye!"
    break
  fi

  if [ "$user_input" = "/clear" ] || [ "$user_input" = "/reset" ]; then
    messages=$(jq -n --arg sp "$SYSTEM_PROMPT" '[{"role": "system", "content": $sp}]')
    echo "Chat history cleared! Started a fresh conversation."
    continue
  fi

  if [ "$user_input" = "/editor" ]; then
    echo "[Editor Mode] Type your multi-line message. Type '/send' on a new line to submit."
    editor_input=""
    while true; do
      if [ -e /dev/tty ]; then
        read -r NEXT_LINE < /dev/tty
      else
        read -r NEXT_LINE
      fi
      
      trimmed_line=$(echo "$NEXT_LINE" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
      if [ "$trimmed_line" = "/send" ]; then
        break
      fi
      
      if [ -z "$editor_input" ]; then
        editor_input="$NEXT_LINE"
      else
        editor_input="$editor_input"$'\\n'"$NEXT_LINE"
      fi
    done
    user_input="$editor_input"
    
    if [ -z "$user_input" ]; then
      echo "Empty message, cancelling..."
      continue
    fi
  fi

  # Append user message to history
  escaped_input=$(echo -n "$user_input" | jq -R -s -c '.')
  messages=$(echo "$messages" | jq ". + [{\\"role\\": \\"user\\", \\"content\\": $escaped_input}]")

  # Construct payload including the selected model
  payload=$(jq -n --argjson msgs "$messages" --arg model "$MODEL" '{model: $model, messages: $msgs}')

  printf "Groq: thinking..."
  response=$(curl -sS -X POST "$BASE_URL/api/groq" \\
    -H "Content-Type: application/json" \\
    -d "$payload")

  # Erase the thinking line
  printf "\\r                  \\r"
  
  echo "Groq: $response"
  echo ""

  # Append assistant response to history
  escaped_response=$(echo -n "$response" | jq -R -s -c '.')
  messages=$(echo "$messages" | jq ". + [{\\"role\\": \\"assistant\\", \\"content\\": $escaped_response}]")

done
`;
}

module.exports = async (req, res) => {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "updates-opal.vercel.app";
  const baseUrl = `${protocol}://${host}`;

  const accept = (req.headers["accept"] || "").toLowerCase();
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const isBrowser =
    accept.includes("text/html") &&
    !userAgent.includes("curl") &&
    !userAgent.includes("wget");

  const wantsJson = accept.includes("application/json");

  // 1. GET requests
  if (req.method === "GET") {
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, baseUrl);
    } catch (_) {
      parsedUrl = { searchParams: new Map() };
    }

    const action = parsedUrl.searchParams.get ? parsedUrl.searchParams.get("action") : req.query?.action;

    // Route: Fetch models proxy
    if (action === "models") {
      const apiKey = getApiKey();
      if (!apiKey) {
        return res.status(500).json({ error: "API key missing" });
      }
      try {
        const resModels = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        const data = await resModels.json();
        // Filter out whisper and sort
        const models = (data.data || [])
          .filter(m => !m.id.includes('whisper'))
          .map(m => m.id)
          .sort();
        return res.status(200).json(models);
      } catch (err) {
        return res.status(500).json({ error: "Failed to fetch models" });
      }
    }

    const queryMessage =
      req.query?.q ||
      req.query?.message ||
      (parsedUrl.searchParams.get ? parsedUrl.searchParams.get("q") : null) ||
      (parsedUrl.searchParams.get ? parsedUrl.searchParams.get("message") : null);

    // One-shot CLI query: /groq?q=...
    if (queryMessage && typeof queryMessage === "string") {
      const apiKey = getApiKey();
      if (!apiKey) {
        return res.status(500).send("Error: GROQ_API_KEY is not configured.\n");
      }
      try {
        const answer = await callGroq(apiKey, queryMessage);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(200).send(answer + "\n");
      } catch (err) {
        return res.status(500).send(`Error: ${err.message}\n`);
      }
    }

    // Web browser: serve interactive HTML terminal
    if (isBrowser) {
      try {
        let htmlPath = path.join(process.cwd(), "ui", "index.html");
        if (!fs.existsSync(htmlPath)) {
          htmlPath = path.join(process.cwd(), "groq", "index.html");
        }
        if (fs.existsSync(htmlPath)) {
          const html = fs.readFileSync(htmlPath, "utf8");
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.status(200).send(html);
        }
      } catch (err) {
        console.error("HTML read error:", err);
      }
    }

    // CLI / curl GET: return bash interactive script
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(generateCliScript(baseUrl));
  }

  // 2. POST requests
  if (req.method === "POST") {
    const apiKey = getApiKey();
    if (!apiKey) {
      if (wantsJson) {
        return res.status(500).json({ error: "GROQ_API_KEY is not configured" });
      }
      return res.status(500).send("Error: GROQ_API_KEY is not configured.\n");
    }

    try {
      let payload = await parseRequestBody(req);

      if (!payload) {
        if (wantsJson) {
          return res.status(400).json({ error: "Message is required" });
        }
        return res.status(400).send("Error: Message is required.\n");
      }

      const answer = await callGroq(apiKey, payload);

      if (wantsJson) {
        return res.status(200).json({ response: answer });
      }

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(answer);
    } catch (err) {
      console.error("Groq error:", err);
      if (wantsJson) {
        return res.status(500).json({
          error: err.message || "Internal server error"
        });
      }
      return res.status(500).send(`Error: ${err.message || "Internal server error"}\n`);
    }
  }

  return res.status(405).send("Method Not Allowed\n");
};