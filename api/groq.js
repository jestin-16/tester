const fs = require("fs");
const path = require("path");

function getApiKey() {
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) {
    return process.env.GROQ_API_KEY.trim();
  }
  if (process.env.XAI_API_KEY && process.env.XAI_API_KEY.trim()) {
    return process.env.XAI_API_KEY.trim();
  }

  // Local .env fallback for development/testing
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
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
    }
  } catch (_) {}

  return null;
}

function getProvider(apiKey) {
  if (apiKey && apiKey.startsWith("xai-")) {
    return {
      name: "xAI Grok",
      baseUrl: "https://api.x.ai/v1",
      defaultModel: process.env.GROQ_MODEL || process.env.XAI_MODEL || "grok-2-latest",
      modelsUrl: "https://api.x.ai/v1/models",
      filterModel: (id) => !id.includes("embedding") && !id.includes("vision")
    };
  }
  return {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    filterModel: (id) => !id.includes("whisper") && !id.includes("guard")
  };
}

function extractUserPromptText(payload) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  if (payload.message && typeof payload.message === "string") return payload.message;
  if (payload.q && typeof payload.q === "string") return payload.q;
  if (Array.isArray(payload.messages)) {
    const userMsg = [...payload.messages].reverse().find((m) => m && m.role === "user");
    if (userMsg && typeof userMsg.content === "string") return userMsg.content;
  }
  if (Array.isArray(payload)) {
    const userMsg = [...payload].reverse().find((m) => m && m.role === "user");
    if (userMsg && typeof userMsg.content === "string") return userMsg.content;
  }
  return "";
}

function selectOptimalModel(promptText, requestedModel = null) {
  if (
    requestedModel &&
    typeof requestedModel === "string" &&
    requestedModel.trim() &&
    requestedModel.trim().toLowerCase() !== "auto" &&
    requestedModel.trim().toLowerCase() !== "default"
  ) {
    return requestedModel.trim();
  }
  if (!promptText || typeof promptText !== "string") {
    return "openai/gpt-oss-20b";
  }

  const lower = promptText.toLowerCase();

  // Category 1: Coding, Python, Pandas, Matplotlib, Data Science implementation
  // Route to Qwen 27B (specialized coder & technical reasoning)
  const isCoding =
    lower.includes("code") ||
    lower.includes("python") ||
    lower.includes("def ") ||
    lower.includes("import ") ||
    lower.includes("pandas") ||
    lower.includes("numpy") ||
    lower.includes("dataframe") ||
    lower.includes("matplotlib") ||
    lower.includes("seaborn") ||
    lower.includes("plt.") ||
    lower.includes("sns.") ||
    lower.includes("script") ||
    lower.includes("program") ||
    lower.includes("function") ||
    lower.includes("syntax") ||
    lower.includes("class ") ||
    lower.includes("knn") ||
    lower.includes("loop") ||
    lower.includes("array") ||
    lower.includes("bug") ||
    lower.includes("error") ||
    lower.includes("implement") ||
    lower.includes("write a") ||
    lower.includes("scikit") ||
    lower.includes("sklearn") ||
    lower.includes("plot") ||
    lower.includes("graph") ||
    lower.includes("chart") ||
    lower.includes("fillna") ||
    lower.includes("dropna") ||
    lower.includes("groupby");

  // Category 2: Math, Probability, Bayes, Derivation, Deep Theory, Decision Trees
  // Route to GPT-OSS 120B (powerhouse 120-billion parameter model for deep reasoning)
  const isDeepReasoning =
    lower.includes("calculate") ||
    lower.includes("bayes") ||
    lower.includes("probability") ||
    lower.includes("formula") ||
    lower.includes("entropy") ||
    lower.includes("information gain") ||
    lower.includes("laplace") ||
    lower.includes("smoothing") ||
    lower.includes("derive") ||
    lower.includes("derivation") ||
    lower.includes("math") ||
    lower.includes("explain in detail") ||
    lower.includes("step by step") ||
    lower.includes("why ") ||
    lower.includes("compare ") ||
    lower.includes("difference between") ||
    lower.includes("decision tree") ||
    lower.includes("theorem") ||
    lower.includes("solve") ||
    lower.includes("posterior") ||
    lower.includes("prior") ||
    lower.includes("likelihood") ||
    promptText.length > 250;

  if (isCoding) {
    return "qwen/qwen3.8-27b";
  }

  if (isDeepReasoning) {
    return "openai/gpt-oss-120b";
  }

  // Category 3: Quick queries, short questions, fast responses
  // Route to GPT-OSS 20B (ultra-fast lightweight response)
  return "openai/gpt-oss-20b";
}

async function callGroq(apiKey, payload) {
  const provider = getProvider(apiKey);
  const promptText = extractUserPromptText(payload);
  const requestedModel =
    typeof payload === "object" && payload !== null ? payload.model : null;
  const optimalModel = selectOptimalModel(promptText, requestedModel);

  // Cascading fallback chain: optimal model -> 20B -> 27B -> 120B -> provider default
  const candidateModels = [
    optimalModel,
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    provider.defaultModel
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  let messages = [];
  const payloadMessages = payload.messages || payload;

  if (Array.isArray(payloadMessages)) {
    if (payloadMessages.length > 0 && payloadMessages[0].role !== "system") {
      messages.push({
        role: "system",
        content:
          "You are an expert AI assistant running in a terminal CLI. Keep responses clear, concise, highly accurate, and terminal-friendly."
      });
    }
    messages.push(...payloadMessages);
  } else {
    messages = [
      {
        role: "system",
        content:
          "You are an expert AI assistant running in a terminal CLI. Keep responses clear, concise, highly accurate, and terminal-friendly."
      },
      {
        role: "user",
        content:
          typeof payloadMessages === "string"
            ? payloadMessages
            : typeof payloadMessages === "object" && payloadMessages.message
            ? payloadMessages.message
            : JSON.stringify(payloadMessages)
      }
    ];
  }

  let lastError = null;

  for (const modelToTry of candidateModels) {
    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelToTry,
          messages
        })
      });

      const data = await response.json();

      if (response.ok && data.choices?.[0]?.message?.content) {
        return {
          content: data.choices[0].message.content,
          model: modelToTry,
          toString() {
            return this.content;
          }
        };
      }

      const errMsg = data.error?.message || response.statusText;
      console.warn(`Model ${modelToTry} returned error: ${errMsg}. Trying next model...`);
      lastError = errMsg;
    } catch (err) {
      console.warn(`Model ${modelToTry} fetch exception: ${err.message}. Trying next model...`);
      lastError = err.message;
    }
  }

  throw new Error(lastError || "All AI models failed to respond.");
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
  const systemPrompt =
    "You are a helpful AI assistant running in a terminal CLI. Keep responses concise, clear, and terminal-friendly.";

  return `#!/usr/bin/env bash
# ==============================================================================
# AI CLI (Bash)
# Quick Start:
#   Interactive:   curl -sL ${baseUrl}/groq | bash
#   Ask question:  curl -sL "${baseUrl}/groq?q=your+question"
# ==============================================================================

set -e
BASE_URL="${baseUrl}"

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
    echo "Warning: 'jq' is not installed. Entering direct chat mode."
    while true; do
      read -r -p "You: " user_input
      [ -z "$user_input" ] && continue
      [ "$user_input" = "exit" ] && break
      curl -sS -X POST "$BASE_URL/api/groq" -H "Content-Type: text/plain" -d "$user_input"
      echo ""
    done
    exit 0
fi

# Fetch models
echo "Fetching available models..."
models_json=$(curl -sS "$BASE_URL/api/groq?action=models" 2>/dev/null || echo "[]")
model_list=$(echo "$models_json" | jq -r '.[]' 2>/dev/null || echo "")

if [ -n "$model_list" ] && [ -e /dev/tty ]; then
  echo "Please select a model:"
  select MODEL in $model_list; do
    [ -n "$MODEL" ] && break
  done < /dev/tty
fi

echo "========================================="
echo "           AI Terminal Chat              "
echo "========================================="
echo "Connected via $BASE_URL (Model: \${MODEL:-default})"
echo "Type your question and press Enter. (Type 'exit' to quit)"
echo ""

messages='[{"role":"system","content":"You are a helpful AI terminal assistant."}]'

while true; do
  read -r -p "You: " user_input
  [ -z "$user_input" ] && continue
  if [ "$user_input" = "exit" ] || [ "$user_input" = "quit" ] || [ "$user_input" = "q" ]; then
    echo "Goodbye!"
    break
  fi
  if [ "$user_input" = "/clear" ]; then
    messages='[{"role":"system","content":"You are a helpful AI terminal assistant."}]'
    echo "Chat cleared!"
    continue
  fi

  escaped=$(echo -n "$user_input" | jq -R -s -c '.')
  messages=$(echo "$messages" | jq ". + [{\\"role\\":\\"user\\",\\"content\\":$escaped}]")
  payload=$(jq -n --argjson msgs "$messages" --arg model "\${MODEL:-}" '{model: (if $model=="" then null else $model end), messages: $msgs}')

  printf "Thinking..."
  response=$(curl -sS -X POST "$BASE_URL/api/groq" -H "Content-Type: application/json" -d "$payload")
  printf "\\r           \\r"

  echo "AI: $response"
  echo ""
  escaped_res=$(echo -n "$response" | jq -R -s -c '.')
  messages=$(echo "$messages" | jq ". + [{\\"role\\":\\"assistant\\",\\"content\\":$escaped_res}]")
done
`;
}

function generatePowerShellScript(baseUrl) {
  return `# ==============================================================================
# AI Terminal CLI for Windows PowerShell
# Works on ALL PowerShell versions (PowerShell 2.0 to 7+)
#
# Universal Run command (No 'irm' needed):
#   (New-Object Net.WebClient).DownloadString('${baseUrl}/groq.ps1') | iex
# ==============================================================================
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072 } catch {}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$BaseUrl = "${baseUrl}".TrimEnd('/')

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "           AI Terminal Chat              " -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Connected via: $BaseUrl" -ForegroundColor DarkGray
Write-Host "Commands: exit, /clear, /reset" -ForegroundColor DarkGray
Write-Host ""

$history = @()

while ($true) {
    Write-Host "You: " -ForegroundColor Green -NoNewline
    $userInput = Read-Host
    if ([string]::IsNullOrWhiteSpace($userInput)) { continue }

    if ($userInput -in @("exit", "quit", "q")) {
        Write-Host "Goodbye!" -ForegroundColor Yellow
        break
    }
    if ($userInput -in @("/clear", "/reset")) {
        $history = @()
        Write-Host "Chat history cleared!" -ForegroundColor Yellow
        continue
    }

    $history += @{ role = "user"; content = $userInput }
    Write-Host "AI is thinking..." -ForegroundColor DarkGray -NoNewline

    try {
        $reply = ""
        if (Get-Command Invoke-RestMethod -ErrorAction SilentlyContinue) {
            $payloadObj = @{ messages = $history }
            $payloadJson = $payloadObj | ConvertTo-Json -Depth 5 -Compress
            $res = Invoke-RestMethod -Uri "$BaseUrl/api/groq" -Method Post -ContentType "application/json; charset=utf-8" -Body $payloadJson -TimeoutSec 60
            $reply = if ($res.response) { $res.response } else { "$res" }
        } else {
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add("Content-Type", "text/plain; charset=utf-8")
            $wc.Encoding = [System.Text.Encoding]::UTF8
            $reply = $wc.UploadString("$BaseUrl/api/groq", $userInput)
        }

        Write-Host "\`r                   \`r" -NoNewline
        Write-Host "AI: " -ForegroundColor Cyan -NoNewline
        Write-Host $reply
        Write-Host ""
        $history += @{ role = "assistant"; content = $reply }
    } catch {
        Write-Host "\`r                   \`r" -NoNewline
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($history.Count -gt 0) { $history = $history[0..($history.Count - 2)] }
    }
}
`;
}

function generateBatchScript(baseUrl) {
  return `@echo off
echo.
echo =========================================
echo            AI Terminal Chat (CMD)
echo =========================================
echo Connected via: ${baseUrl}
echo Type your question and press Enter. (Type 'exit' to quit)
echo.

:chat_loop
set "user_msg="
set /p "user_msg=You: "
if not defined user_msg goto chat_loop
if /i "%user_msg%"=="exit" goto :eof
if /i "%user_msg%"=="quit" goto :eof
if /i "%user_msg%"=="q" goto :eof

echo.
curl.exe -s -d "%user_msg%" ${baseUrl}/q
echo.
goto chat_loop
`;
}


module.exports = async (req, res) => {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "tester-red-two.vercel.app";
  const baseUrl = `${protocol}://${host}`;

  const accept = (req.headers["accept"] || "").toLowerCase();
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const isBrowser =
    accept.includes("text/html") &&
    !userAgent.includes("curl") &&
    !userAgent.includes("wget") &&
    !userAgent.includes("powershell") &&
    !userAgent.includes("pwsh");

  const wantsJson =
    accept.includes("application/json") ||
    Boolean(req.headers["content-type"] && req.headers["content-type"].includes("application/json"));

  // 1. GET requests
  if (req.method === "GET") {
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, baseUrl);
    } catch (_) {
      parsedUrl = { searchParams: new Map() };
    }

    const action = parsedUrl.searchParams.get
      ? parsedUrl.searchParams.get("action")
      : req.query?.action;

    // Route: Fetch models
    if (action === "models") {
      const apiKey = getApiKey();
      if (!apiKey) {
        return res.status(500).json({ error: "GROQ_API_KEY is not configured in Vercel environment variables" });
      }
      const provider = getProvider(apiKey);
      try {
        const resModels = await fetch(provider.modelsUrl, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        const data = await resModels.json();
        const models = (data.data || [])
          .map((m) => m.id)
          .filter(provider.filterModel)
          .sort();
        return res.status(200).json(models);
      } catch (err) {
        return res.status(500).json({ error: `Failed to fetch models from ${provider.name}` });
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
        return res.status(500).send("Error: GROQ_API_KEY is not configured in Vercel environment variables.\n");
      }
      try {
        const result = await callGroq(apiKey, queryMessage);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("X-AI-Model", result.model || "auto");
        return res.status(200).send(result.content + "\n");
      } catch (err) {
        return res.status(500).send(`Error: ${err.message}\n`);
      }
    }

    // PowerShell script check: format=ps1 or PowerShell User-Agent
    const format =
      req.query?.format ||
      (parsedUrl.searchParams.get ? parsedUrl.searchParams.get("format") : null);

    const isPowerShell =
      format === "ps1" ||
      userAgent.includes("powershell") ||
      userAgent.includes("pwsh");



    if (isPowerShell) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(generatePowerShellScript(baseUrl));
    }

    if (format === "bat" || format === "cmd") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(generateBatchScript(baseUrl));
    }

    // Web browser: serve interactive HTML terminal
    if (isBrowser && format !== "sh" && format !== "bash") {
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
      const errMsg = "Error: GROQ_API_KEY is not configured in Vercel environment variables.";
      if (wantsJson) {
        return res.status(500).json({ error: errMsg });
      }
      return res.status(500).send(errMsg + "\n");
    }

    try {
      let payload = await parseRequestBody(req);

      if (!payload) {
        if (wantsJson) {
          return res.status(400).json({ error: "Message is required" });
        }
        return res.status(400).send("Error: Message is required.\n");
      }

      const result = await callGroq(apiKey, payload);
      res.setHeader("X-AI-Model", result.model || "auto");

      if (wantsJson) {
        return res.status(200).json({ response: result.content, model: result.model });
      }

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(result.content);
    } catch (err) {
      console.error("API error:", err);
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