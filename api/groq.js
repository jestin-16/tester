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

async function callGroq(apiKey, payload) {
  const provider = getProvider(apiKey);
  let model = payload.model || provider.defaultModel;

  let messages = [];
  const payloadMessages = payload.messages || payload;

  if (Array.isArray(payloadMessages)) {
    if (payloadMessages.length > 0 && payloadMessages[0].role !== "system") {
      messages.push({
        role: "system",
        content:
          "You are a helpful AI assistant running inside a terminal CLI. Keep responses clear, concise, and terminal-friendly."
      });
    }
    messages.push(...payloadMessages);
  } else {
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

  const makeRequest = async (modelToUse) => {
    return await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelToUse,
        messages
      })
    });
  };

  let response = await makeRequest(model);
  let data = await response.json();

  // If model is not available or account does not have access, fallback to openai/gpt-oss-20b
  if (!response.ok && data.error?.message?.includes("does not exist or you do not have access") && model !== "openai/gpt-oss-20b") {
    model = "openai/gpt-oss-20b";
    response = await makeRequest(model);
    data = await response.json();
  }

  if (!response.ok) {
    console.error(`${provider.name} API error:`, data);
    const errorMsg =
      data.error?.message ||
      (typeof data.error === "string" ? data.error : null) ||
      `${provider.name} API request failed`;
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

function generateMenuScript(baseUrl) {
  return `@echo off
setlocal EnableDelayedExpansion
title Data Science Lab Helper

:menu
cls
echo ================================================================================
echo            DATA SCIENCE LAB -- QUESTIONS & ANSWERS (EXAM REVISION)
echo ================================================================================
echo  [1]  CO1 Q1: Student Dataset Statistical Analysis (25 Students)
echo  [2]  CO1 Q2: Employee Performance Report ^& Best Department
echo  [3]  CO1 Q3: 30-Record Pandas Workflow (Clean, Impute, Rank, Export)
echo  [4]  Q4: All 13 Visualization Exercises (Matplotlib, Seaborn, Subplots)
echo  [5]  k-NN Classification From Scratch (All Distance Metrics ^& Predict)
echo  [6]  Bayes Theorem (Clinical Liver Disease Calculation)
echo  [7]  Weather Prediction (Laplace Smoothing ^& Naive Bayes)
echo  [8]  Student Feedback Text Multinomial Naive Bayes
echo  [9]  Decision Tree C5.0 (Bank Loan Eligibility, Entropy, Rules)
echo  [10] Record: EDA, 5 Observations ^& 6-Plot Dashboard
echo  [11] Final 10-Minute Quick Revision Table
echo  [12] Master Revision Sheet (Complete All-in-One)
echo  [A]  Ask AI Custom Question
echo  [0]  Exit
echo ================================================================================
set "choice="
set /p "choice=Enter option [0-12, or A]: "

if "%choice%"=="1" goto q1
if "%choice%"=="2" goto q2
if "%choice%"=="3" goto q3
if "%choice%"=="4" goto viz
if "%choice%"=="5" goto knn
if "%choice%"=="6" goto bayes
if "%choice%"=="7" goto weather
if "%choice%"=="8" goto feedback
if "%choice%"=="9" goto tree
if "%choice%"=="10" goto eda
if "%choice%"=="11" goto quick
if "%choice%"=="12" goto ds
if /i "%choice%"=="a" goto ai
if "%choice%"=="0" goto :eof
echo Invalid selection. Please try again.
pause
goto menu

:q1
cls
curl.exe -s ${baseUrl}/q1
echo.
pause
goto menu

:q2
cls
curl.exe -s ${baseUrl}/q2
echo.
pause
goto menu

:q3
cls
curl.exe -s ${baseUrl}/q3
echo.
pause
goto menu

:viz
cls
curl.exe -s ${baseUrl}/viz
echo.
pause
goto menu

:knn
cls
curl.exe -s ${baseUrl}/knn
echo.
pause
goto menu

:bayes
cls
curl.exe -s ${baseUrl}/bayes
echo.
pause
goto menu

:weather
cls
curl.exe -s ${baseUrl}/weather
echo.
pause
goto menu

:feedback
cls
curl.exe -s ${baseUrl}/feedback
echo.
pause
goto menu

:tree
cls
curl.exe -s ${baseUrl}/tree
echo.
pause
goto menu

:eda
cls
curl.exe -s ${baseUrl}/eda
echo.
pause
goto menu

:quick
cls
curl.exe -s ${baseUrl}/quick
echo.
pause
goto menu

:ds
cls
curl.exe -s ${baseUrl}/ds
echo.
pause
goto menu

:ai
cls
echo Type your question below (or press Enter without text to return to menu):
set "user_q="
set /p "user_q=Question: "
if not defined user_q goto menu
echo.
echo Thinking...
curl.exe -s -d "%user_q%" ${baseUrl}/q
echo.
echo.
pause
goto menu
`;
}

function generatePowerShellMenu(baseUrl) {
  return `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$BaseUrl = "${baseUrl}".TrimEnd('/')

function Show-Menu {
    Clear-Host
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "                   DATA SCIENCE LAB -- SELECT A QUESTION                        " -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " [1]  CO1 Q1: Student Dataset Statistical Analysis"
    Write-Host " [2]  CO1 Q2: Employee Performance Report & Best Department"
    Write-Host " [3]  CO1 Q3: 30-Record Pandas Workflow (Clean, Impute, Rank, Export)"
    Write-Host " [4]  Q4: All 13 Visualization Exercises (Matplotlib, Seaborn, Subplots)"
    Write-Host " [5]  k-NN Classification From Scratch (All Distance Metrics & Predict)"
    Write-Host " [6]  Bayes Theorem (Clinical Liver Disease Calculation)"
    Write-Host " [7]  Weather Prediction (Laplace Smoothing & Naive Bayes)"
    Write-Host " [8]  Student Feedback Text Multinomial Naive Bayes"
    Write-Host " [9]  Decision Tree C5.0 (Bank Loan Eligibility, Entropy, Rules)"
    Write-Host " [10] Record: EDA, 5 Observations & 6-Plot Dashboard"
    Write-Host " [11] Final 10-Minute Quick Revision Table"
    Write-Host " [12] Master Revision Sheet (Complete All-in-One)"
    Write-Host " [A]  Ask AI Custom Question"
    Write-Host " [0]  Exit"
    Write-Host "================================================================================" -ForegroundColor Cyan
}

$routes = @{
    "1"  = "/q1"
    "2"  = "/q2"
    "3"  = "/q3"
    "4"  = "/viz"
    "5"  = "/knn"
    "6"  = "/bayes"
    "7"  = "/weather"
    "8"  = "/feedback"
    "9"  = "/tree"
    "10" = "/eda"
    "11" = "/quick"
    "12" = "/ds"
}

while ($true) {
    Show-Menu
    $choice = (Read-Host "Enter option [0-12, or A]").Trim()
    if ($choice -in @("0", "exit", "q")) { break }
    
    if ($choice -in @("a", "ai")) {
        Clear-Host
        $q = (Read-Host "Enter your question (or press Enter to return)").Trim()
        if ([string]::IsNullOrWhiteSpace($q)) { continue }
        Write-Host "\`nThinking..." -ForegroundColor DarkGray
        try {
            $ans = Invoke-RestMethod -Uri "$BaseUrl/q" -Method Post -Body $q
            Write-Host "\`nAI Answer:\`n$ans" -ForegroundColor Cyan
        } catch {
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        Read-Host "\`nPress Enter to continue..."
        continue
    }
    
    if ($routes.ContainsKey($choice)) {
        Clear-Host
        $url = "$BaseUrl$($routes[$choice])"
        try {
            $txt = (New-Object Net.WebClient).DownloadString($url)
            Write-Host $txt
        } catch {
            Write-Host "Error fetching $url" -ForegroundColor Red
        }
        Read-Host "\`nPress Enter to return to menu..."
    } else {
        Write-Host "Invalid option. Please choose 0 to 12." -ForegroundColor Yellow
        Start-Sleep -Seconds 1
    }
}
`;
}

function generateMainLauncher(baseUrl) {
  return `@echo off
setlocal EnableDelayedExpansion
title Data Science Lab Helper

:main_menu
cls
echo ================================================================================
echo                    DATA SCIENCE LAB -- MAIN PORTAL
echo ================================================================================
echo.
echo  [1] Chat with AI Assistant (Interactive Terminal)
echo  [2] Show Questions ^& Answers (CO1, k-NN, Bayes, Decision Trees, EDA)
echo.
echo  [0] Exit
echo.
echo ================================================================================
set "main_choice="
set /p "main_choice=Enter choice [1 or 2]: "

if "%main_choice%"=="1" goto chat_section
if "%main_choice%"=="2" goto qa_section
if "%main_choice%"=="0" goto :eof

echo Invalid selection. Please enter 1, 2, or 0.
timeout /t 2 >nul 2>&1
goto main_menu

:chat_section
cls
echo ================================================================================
echo                         CHAT WITH AI ASSISTANT
echo ================================================================================
echo Type your question and press Enter.
echo Special commands: 'menu' (return to main portal), 'exit' (quit)
echo.

:chat_loop
set "user_msg="
set /p "user_msg=You: "
if not defined user_msg goto chat_loop
if /i "%user_msg%"=="exit" goto :eof
if /i "%user_msg%"=="quit" goto :eof
if /i "%user_msg%"=="q" goto :eof
if /i "%user_msg%"=="menu" goto main_menu
if /i "%user_msg%"=="back" goto main_menu

echo.
echo AI is thinking...
curl.exe -s -d "%user_msg%" ${baseUrl}/q
echo.
echo.
goto chat_loop

:qa_section
cls
echo ================================================================================
echo                   QUESTIONS ^& ANSWERS -- SELECT A TOPIC
echo ================================================================================
echo  [1]  CO1 Q1: Student Dataset Statistical Analysis (25 Students)
echo  [2]  CO1 Q2: Employee Performance Report ^& Department Stats
echo  [3]  CO1 Q3: 30-Record Pandas Workflow (Clean, Impute, Rank, Export)
echo  [4]  Q4: All 13 Visualizations (Matplotlib, Seaborn, Subplots)
echo  [5]  k-NN Classifier From Scratch (All Metrics, Predict, Evaluate)
echo  [6]  Bayes Theorem (Clinical Liver Disease Problem)
echo  [7]  Weather Prediction (Naive Bayes ^& Laplace Smoothing)
echo  [8]  Student Feedback Text Multinomial Naive Bayes
echo  [9]  Decision Tree C5.0 (Bank Loan Eligibility, Entropy, Rules)
echo  [10] Record: EDA, 5 Observations ^& 6-Plot Dashboard
echo  [11] Final 10-Minute Quick Revision Table
echo  [12] Master Revision Sheet (Complete syllabus in one file)
echo.
echo  [M]  Return to Main Portal
echo  [0]  Exit
echo ================================================================================
set "qa_choice="
set /p "qa_choice=Select topic [1-12, or M]: "

if "%qa_choice%"=="1" ( cls & curl.exe -s ${baseUrl}/q1 & echo. & pause & goto qa_section )
if "%qa_choice%"=="2" ( cls & curl.exe -s ${baseUrl}/q2 & echo. & pause & goto qa_section )
if "%qa_choice%"=="3" ( cls & curl.exe -s ${baseUrl}/q3 & echo. & pause & goto qa_section )
if "%qa_choice%"=="4" ( cls & curl.exe -s ${baseUrl}/viz & echo. & pause & goto qa_section )
if "%qa_choice%"=="5" ( cls & curl.exe -s ${baseUrl}/knn & echo. & pause & goto qa_section )
if "%qa_choice%"=="6" ( cls & curl.exe -s ${baseUrl}/bayes & echo. & pause & goto qa_section )
if "%qa_choice%"=="7" ( cls & curl.exe -s ${baseUrl}/weather & echo. & pause & goto qa_section )
if "%qa_choice%"=="8" ( cls & curl.exe -s ${baseUrl}/feedback & echo. & pause & goto qa_section )
if "%qa_choice%"=="9" ( cls & curl.exe -s ${baseUrl}/tree & echo. & pause & goto qa_section )
if "%qa_choice%"=="10" ( cls & curl.exe -s ${baseUrl}/eda & echo. & pause & goto qa_section )
if "%qa_choice%"=="11" ( cls & curl.exe -s ${baseUrl}/quick & echo. & pause & goto qa_section )
if "%qa_choice%"=="12" ( cls & curl.exe -s ${baseUrl}/ds & echo. & pause & goto qa_section )
if /i "%qa_choice%"=="m" goto main_menu
if "%qa_choice%"=="0" goto :eof

echo Invalid selection.
pause
goto qa_section
`;
}

function generatePowerShellLauncher(baseUrl) {
  return `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$BaseUrl = "${baseUrl}".TrimEnd('/')

function Start-Chat {
    Clear-Host
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "                         CHAT WITH AI ASSISTANT                                 " -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "Type your question and press Enter. Type 'menu' to return, or 'exit' to quit.\`n"
    while ($true) {
        $q = (Read-Host "You").Trim()
        if ([string]::IsNullOrWhiteSpace($q)) { continue }
        if ($q -in @("exit", "quit", "q")) { break }
        if ($q -in @("menu", "back")) { return }
        Write-Host "\`nThinking..." -ForegroundColor DarkGray
        try {
            $ans = Invoke-RestMethod -Uri "$BaseUrl/q" -Method Post -Body $q
            Write-Host "\`nAI Answer:\`n$ans\`n" -ForegroundColor Cyan
        } catch {
            Write-Host "Error: $($_.Exception.Message)\`n" -ForegroundColor Red
        }
    }
}

function Show-QaMenu {
    $routes = @{
        "1"  = "/q1"; "2"  = "/q2"; "3"  = "/q3"; "4"  = "/viz"
        "5"  = "/knn"; "6" = "/bayes"; "7"  = "/weather"; "8"  = "/feedback"
        "9"  = "/tree"; "10" = "/eda"; "11" = "/quick"; "12" = "/ds"
    }
    while ($true) {
        Clear-Host
        Write-Host "================================================================================" -ForegroundColor Cyan
        Write-Host "                   QUESTIONS & ANSWERS -- SELECT A TOPIC                        " -ForegroundColor Green
        Write-Host "================================================================================" -ForegroundColor Cyan
        Write-Host " [1]  CO1 Q1: Student Dataset Statistical Analysis"
        Write-Host " [2]  CO1 Q2: Employee Performance Report & Best Department"
        Write-Host " [3]  CO1 Q3: 30-Record Pandas Workflow (Clean, Impute, Rank, Export)"
        Write-Host " [4]  Q4: All 13 Visualization Exercises (Matplotlib, Seaborn, Subplots)"
        Write-Host " [5]  k-NN Classification From Scratch (All Distance Metrics & Predict)"
        Write-Host " [6]  Bayes Theorem (Clinical Liver Disease Calculation)"
        Write-Host " [7]  Weather Prediction (Laplace Smoothing & Naive Bayes)"
        Write-Host " [8]  Student Feedback Text Multinomial Naive Bayes"
        Write-Host " [9]  Decision Tree C5.0 (Bank Loan Eligibility, Entropy, Rules)"
        Write-Host " [10] Record: EDA, 5 Observations & 6-Plot Dashboard"
        Write-Host " [11] Final 10-Minute Quick Revision Table"
        Write-Host " [12] Master Revision Sheet (Complete syllabus in one file)"
        Write-Host " [M]  Return to Main Portal"
        Write-Host " [0]  Exit"
        Write-Host "================================================================================" -ForegroundColor Cyan
        $choice = (Read-Host "Select topic [1-12, or M]").Trim()
        if ($choice -in @("0", "exit", "q")) { exit }
        if ($choice -in @("m", "back", "menu")) { return }
        if ($routes.ContainsKey($choice)) {
            Clear-Host
            $url = "$BaseUrl$($routes[$choice])"
            try {
                $txt = (New-Object Net.WebClient).DownloadString($url)
                Write-Host $txt
            } catch {
                Write-Host "Error fetching $url" -ForegroundColor Red
            }
            Read-Host "\`nPress Enter to return to menu..."
        }
    }
}

while ($true) {
    Clear-Host
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host "                    DATA SCIENCE LAB -- MAIN PORTAL                             " -ForegroundColor Green
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " [1] Chat with AI Assistant (Interactive Terminal)"
    Write-Host " [2] Show Questions & Answers (CO1, k-NN, Bayes, Decision Trees, EDA)"
    Write-Host " [0] Exit"
    Write-Host "================================================================================" -ForegroundColor Cyan
    $mainChoice = (Read-Host "Enter choice [1 or 2]").Trim()
    if ($mainChoice -eq "1") { Start-Chat }
    elseif ($mainChoice -eq "2") { Show-QaMenu }
    elseif ($mainChoice -in @("0", "exit", "q")) { break }
}
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

  const wantsJson = accept.includes("application/json");

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
        const answer = await callGroq(apiKey, queryMessage);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(200).send(answer + "\n");
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

    if (action === "run" || format === "run" || action === "start" || format === "start" || action === "launcher" || format === "launcher") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      if (isPowerShell) {
        return res.status(200).send(generatePowerShellLauncher(baseUrl));
      }
      return res.status(200).send(generateMainLauncher(baseUrl));
    }

    if (action === "menu" || format === "menu" || action === "exam" || format === "exam" || action === "qa" || format === "qa" || action === "questions" || format === "questions") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      if (isPowerShell) {
        return res.status(200).send(generatePowerShellMenu(baseUrl));
      }
      return res.status(200).send(generateMenuScript(baseUrl));
    }

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

      const answer = await callGroq(apiKey, payload);

      if (wantsJson) {
        return res.status(200).json({ response: answer });
      }

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(answer);
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