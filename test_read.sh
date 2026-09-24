#!/bin/bash
echo "Paste some lines:"
read -r REPLY
while read -t 0; do
  read -r NEXT_LINE
  REPLY="$REPLY\n$NEXT_LINE"
done
echo -e "You entered:\n$REPLY"
