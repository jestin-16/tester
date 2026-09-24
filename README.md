# AI Terminal & Cloud CLI

A modern, fast CLI and web interface for **Groq** and **xAI (Grok)**, deployable on Vercel or runnable locally in terminal.

---

## 🚀 Running in Terminal on Windows

You can run the CLI locally using Node.js (cross-platform, zero dependencies required):

```powershell
# Interactive chat mode
node chat.js
# Or via npm
npm start
# Or PowerShell wrapper
.\chat.ps1
# Or Command Prompt
chat
```

### Single-Question Mode
```powershell
node chat.js "Explain Docker in 3 bullet points"
```

### Connect directly to your hosted Vercel deployment
If you have configured your key on Vercel and don't want to save it locally:
```powershell
node chat.js --url https://your-deployment.vercel.app
node chat.js --url https://your-deployment.vercel.app "What is Kubernetes?"
```

---

## 🌐 Running directly in PowerShell with `curl.exe`

Windows 10 (build 17063+) and Windows 11 have `curl.exe` pre-installed.

### 1. Instant One-Shot Question
```powershell
curl.exe -s -d "What is Docker in 2 sentences?" https://tester-red-two.vercel.app/groq
```
*(or via query string: `curl.exe -s "https://tester-red-two.vercel.app/groq?q=hello"`)*

### 2. Interactive Terminal Chat
```powershell
(curl.exe -s https://tester-red-two.vercel.app/groq.ps1 | Out-String) | iex
```

### 3. Create an `ask` Command (Recommended)
Paste this once into your PowerShell terminal:
```powershell
function ask($q) { curl.exe -s -d "$q" https://tester-red-two.vercel.app/groq }
```
Then ask anything anytime:
```powershell
ask "how to find open ports in powershell"
ask "write a python regex for email"
```

> **Tip**: In Windows PowerShell, `curl` is an alias to `Invoke-WebRequest`. If you want to type `curl` instead of `curl.exe`, run:
> ```powershell
> Remove-Item Alias:curl -ErrorAction SilentlyContinue
> ```

---

## ⚡ Fallback Methods (If `curl.exe` is absent on older Windows)

### Universal .NET WebClient (PowerShell 2.0+ / Windows 7+)
```powershell
# Interactive chat
[Net.ServicePointManager]::SecurityProtocol = 3072; (New-Object Net.WebClient).DownloadString('https://tester-red-two.vercel.app/groq.ps1') | iex

# Quick question
(New-Object Net.WebClient).DownloadString('https://tester-red-two.vercel.app/groq?q=hello')
```

---

## 🐧 Linux / macOS / Git Bash

```bash
# Web one-liner (interactive bash)
curl -sL https://your-deployment.vercel.app/groq | bash

# Local bash script
./chat_groq.sh
```

---

## 🔑 Environment Setup

Supported providers (auto-detected by key prefix):
* **Groq** (`gsk_...`): [console.groq.com](https://console.groq.com/keys)
* **xAI Grok** (`xai-...`): [console.x.ai](https://console.x.ai)

Set in `.env` (git-ignored):
```env
GROQ_API_KEY=your_key_here
```
Or set in **Vercel Project Settings → Environment Variables**.
