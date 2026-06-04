#!/usr/bin/env bash
# Install ngrok via Homebrew (Option A). Run in Terminal.app / iTerm.
set -euo pipefail

install_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return 0
  fi
  echo "→ Homebrew не найден. Установка (потребуется пароль macOS)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Add brew to PATH for current shell session
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

install_homebrew

echo "→ Устанавливаем ngrok..."
brew install ngrok/ngrok/ngrok

if ! ngrok config check >/dev/null 2>&1; then
  echo ""
  echo "Токен: https://dashboard.ngrok.com/get-started/your-authtoken"
  read -r -p "Вставьте ngrok authtoken: " NGROK_TOKEN
  ngrok config add-authtoken "$NGROK_TOKEN"
fi

echo ""
echo "Готово. Запуск туннеля (uvicorn должен работать на :8000):"
echo "  ngrok http 8000"
echo ""
echo "Webhook для Recall:"
echo "  https://<ваш-ngrok-host>/webhook/recall"
