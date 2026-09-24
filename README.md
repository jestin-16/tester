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

## 🌐 Running directly in PowerShell (Universal Methods)

From **any** Windows PowerShell terminal without cloning the repo:

### Method 1: Universal .NET WebClient (Works on 100% of Windows/PowerShell systems - No `irm` needed)
Works on all versions (Windows 7/8/10/11, PowerShell 2.0 to 7+):
```powershell
# Interactive chat
[Net.ServicePointManager]::SecurityProtocol = 3072; (New-Object Net.WebClient).DownloadString('https://tester-red-two.vercel.app/groq.ps1') | iex

# Quick one-shot question
(New-Object Net.WebClient).DownloadString('https://tester-red-two.vercel.app/groq?q=hello')
```

### Method 2: Create a permanent `ai` command in PowerShell
Paste this once into your PowerShell window (or add to `$PROFILE`):
```powershell
function ai($q){ [Net.ServicePointManager]::SecurityProtocol = 3072; (New-Object Net.WebClient).DownloadString("https://tester-red-two.vercel.app/groq?q=" + [Uri]::EscapeDataString($q)) }
```
Then use it anytime:
```powershell
ai "how to find large files in windows"
```

### Method 3: `Invoke-WebRequest` (`iwr`)
```powershell
(iwr -UseBasicParsing https://tester-red-two.vercel.app/groq.ps1).Content | iex
```

### Method 4: Built-in `curl.exe` (Windows 10/11)
```powershell
curl.exe -s "https://tester-red-two.vercel.app/groq?q=hello"
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
