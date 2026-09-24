#!/bin/bash

# Ensure GROQ_API_KEY is set
if [ -z "$GROQ_API_KEY" ]; then
  # Try to load from .env file if it exists
  if [ -f .env ]; then
    # Source the .env file while exporting its variables
    set -a
    source .env
    set +a
  fi
  
  if [ -z "$GROQ_API_KEY" ]; then
    echo "Error: GROQ_API_KEY environment variable is not set."
    echo "Please set it in your .env file or run: export GROQ_API_KEY='your_api_key'"
    exit 1
  fi
fi

# Ensure jq is installed (needed for JSON parsing in bash)
if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed. Please install it to run this script (e.g., sudo apt install jq)."
    exit 1
fi

# Fetch available models dynamically based on your API key
echo "Fetching available models..."
models_json=$(curl -s -X GET "https://api.groq.com/openai/v1/models" -H "Authorization: Bearer $GROQ_API_KEY")
model_list=$(echo "$models_json" | jq -r '.data[].id' 2>/dev/null | grep -v 'whisper')

if [ -z "$model_list" ]; then
    echo "Error: Could not fetch models from Groq API. Please check your API key."
    exit 1
fi

echo "Please select a model to use:"
select MODEL in $model_list; do
    if [ -n "$MODEL" ]; then
        break
    else
        echo "Invalid selection. Please try again."
    fi
done

# Initialize chat history with a system message
messages='[{"role": "system", "content": "You are a helpful assistant."}]'

echo "========================================="
echo "        Groq Interactive Chat           "
echo "        Model: $MODEL "
echo " (Type 'exit' or 'quit' to end the chat) "
echo "========================================="

while true; do
  echo -n -e "\n\033[1;32mYou:\033[0m "
  read -r user_input
  
  if [[ "$user_input" == "exit" || "$user_input" == "quit" ]]; then
    echo "Goodbye!"
    break
  fi
  
  if [[ -z "$user_input" ]]; then
    continue
  fi
  
  # Append user message to history
  escaped_input=$(echo "$user_input" | jq -R -s -c '.[0:-1]')
  messages=$(echo "$messages" | jq ". + [{\"role\": \"user\", \"content\": $escaped_input}]")
  
  # Construct payload
  payload=$(jq -n --argjson msgs "$messages" --arg model "$MODEL" '{model: $model, messages: $msgs}')
  
  # Call Groq API
  response=$(curl -s -X POST "https://api.groq.com/openai/v1/chat/completions" \
       -H "Authorization: Bearer $GROQ_API_KEY" \
       -H "Content-Type: application/json" \
       -d "$payload")
  
  # Extract response content
  assistant_message=$(echo "$response" | jq -r '.choices[0].message.content // empty')
  
  if [[ -z "$assistant_message" || "$assistant_message" == "null" ]]; then
    error_msg=$(echo "$response" | jq -r '.error.message // empty')
    echo -e "\033[1;31mError:\033[0m Failed to get a valid response from Groq."
    if [[ -n "$error_msg" ]]; then
        echo -e "\033[1;31mDetails:\033[0m $error_msg"
    else
        echo "Raw Response: $response"
    fi
    # Remove the last user message from history to allow retry
    messages=$(echo "$messages" | jq 'del(.[-1])')
    continue
  fi
  
  echo -e "\n\033[1;36mGroq:\033[0m $assistant_message"
  
  # Append assistant response to history
  escaped_response=$(echo "$assistant_message" | jq -R -s -c '.[0:-1]')
  messages=$(echo "$messages" | jq ". + [{\"role\": \"assistant\", \"content\": $escaped_response}]")
  
done
