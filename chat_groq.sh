#!/usr/bin/env bash
# ==============================================================================
# Cross-Platform AI Chat (Groq & xAI Grok)
# ==============================================================================

# Ensure GROQ_API_KEY or XAI_API_KEY is set
if [ -z "$GROQ_API_KEY" ] && [ -z "$XAI_API_KEY" ]; then
  if [ -f .env ]; then
    set -a
    source .env 2>/dev/null || true
    set +a
  fi
fi

API_KEY="${GROQ_API_KEY:-$XAI_API_KEY}"

if [ -z "$API_KEY" ]; then
  echo "Error: GROQ_API_KEY environment variable is not set."
  echo "Please set it in your .env file or run: export GROQ_API_KEY='your_api_key'"
  exit 1
fi

# Detect provider
if [[ "$API_KEY" == xai-* ]]; then
  PROVIDER="xAI Grok"
  BASE_URL="https://api.x.ai/v1"
  DEFAULT_MODEL="grok-2-latest"
else
  PROVIDER="Groq"
  BASE_URL="https://api.groq.com/openai/v1"
  DEFAULT_MODEL="llama-3.3-70b-versatile"
fi

# Check for jq
if ! command -v jq &> /dev/null; then
  echo "Note: 'jq' is not installed. Running in simple mode."
  echo "========================================="
  echo "     $PROVIDER Interactive Chat          "
  echo "========================================="
  while true; do
    read -r -p "You: " user_input
    [ -z "$user_input" ] && continue
    [[ "$user_input" == "exit" || "$user_input" == "quit" ]] && break
    
    # Send simple request
    payload="{\"model\":\"$DEFAULT_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"$user_input\"}]}"
    curl -s -X POST "$BASE_URL/chat/completions" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$payload"
    echo ""
  done
  exit 0
fi

# Fetch models dynamically
echo "Fetching available models for $PROVIDER..."
models_json=$(curl -s -X GET "$BASE_URL/models" -H "Authorization: Bearer $API_KEY")
model_list=$(echo "$models_json" | jq -r '.data[].id' 2>/dev/null | grep -v -E 'whisper|embedding')

MODEL="$DEFAULT_MODEL"
if [ -n "$model_list" ]; then
  echo "Select a model (press Enter for default: $DEFAULT_MODEL):"
  select M in $model_list; do
    [ -n "$M" ] && MODEL="$M"
    break
  done
fi

messages='[{"role": "system", "content": "You are a helpful assistant."}]'

echo "========================================="
echo "        $PROVIDER Interactive Chat       "
echo "        Model: $MODEL "
echo " (Type 'exit' or 'quit' to end the chat) "
echo "========================================="

while true; do
  echo -n -e "\nYou: "
  read -r user_input
  
  if [[ "$user_input" == "exit" || "$user_input" == "quit" ]]; then
    echo "Goodbye!"
    break
  fi
  
  if [[ -z "$user_input" ]]; then
    continue
  fi
  
  escaped_input=$(echo "$user_input" | jq -R -s -c '.[0:-1]')
  messages=$(echo "$messages" | jq ". + [{\"role\": \"user\", \"content\": $escaped_input}]")
  payload=$(jq -n --argjson msgs "$messages" --arg model "$MODEL" '{model: $model, messages: $msgs}')
  
  response=$(curl -s -X POST "$BASE_URL/chat/completions" \
       -H "Authorization: Bearer $API_KEY" \
       -H "Content-Type: application/json" \
       -d "$payload")
  
  assistant_message=$(echo "$response" | jq -r '.choices[0].message.content // empty')
  
  if [[ -z "$assistant_message" || "$assistant_message" == "null" ]]; then
    error_msg=$(echo "$response" | jq -r '.error.message // .error // empty')
    echo "Error: Failed to get response."
    [ -n "$error_msg" ] && echo "Details: $error_msg"
    messages=$(echo "$messages" | jq 'del(.[-1])')
    continue
  fi
  
  echo -e "\n$PROVIDER: $assistant_message"
  escaped_response=$(echo "$assistant_message" | jq -R -s -c '.[0:-1]')
  messages=$(echo "$messages" | jq ". + [{\"role\": \"assistant\", \"content\": $escaped_response}]")
done
