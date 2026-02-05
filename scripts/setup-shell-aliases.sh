#!/bin/bash
# Add Claude Code aliases to your shell config for chipp-deno
# Usage: ./scripts/setup-shell-aliases.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Detect shell config file
if [[ "$SHELL" == *"zsh"* ]]; then
    SHELL_RC="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
    # macOS uses .bash_profile, Linux uses .bashrc
    if [[ "$(uname)" == "Darwin" ]]; then
        SHELL_RC="$HOME/.bash_profile"
    else
        SHELL_RC="$HOME/.bashrc"
    fi
else
    echo "Unknown shell: $SHELL"
    echo "Please manually add these aliases to your shell config:"
    echo '  alias cc="cd ~/code/chipp-deno && ./scripts/claude-start.sh"'
    echo '  alias ccyolo="cd ~/code/chipp-deno && ./scripts/claude-start.sh --yolo"'
    exit 1
fi

# Remove old monorepo aliases if they exist
if grep -q "alias cc=" "$SHELL_RC" 2>/dev/null; then
    echo -e "${YELLOW}Removing existing cc aliases from $SHELL_RC${NC}"
    # Create temp file without the old aliases
    grep -v "alias cc" "$SHELL_RC" | grep -v "# Claude Code shortcuts" > "$SHELL_RC.tmp"
    mv "$SHELL_RC.tmp" "$SHELL_RC"
fi

# Add new aliases
cat >> "$SHELL_RC" << 'EOF'

# Claude Code shortcuts (chipp-deno)
alias cc="cd ~/code/chipp-deno && ./scripts/claude-start.sh"
alias ccc="cd ~/code/chipp-deno && ./scripts/claude-start.sh --continue"
alias ccyolo="cd ~/code/chipp-deno && ./scripts/claude-start.sh --yolo"
alias cccyolo="cd ~/code/chipp-deno && ./scripts/claude-start.sh --yolo --continue"
EOF

echo -e "${GREEN}Aliases added to $SHELL_RC${NC}"
echo ""
echo "Added:"
echo "  cc      - Start Claude Code (normal mode)"
echo "  ccc     - Continue previous Claude session"
echo "  ccyolo  - Start Claude Code (autonomous mode)"
echo "  cccyolo - Continue previous session in autonomous mode"
echo ""
echo -e "${YELLOW}Run 'source $SHELL_RC' or open a new terminal to use them.${NC}"
