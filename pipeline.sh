#!/bin/bash
set -euo pipefail

# Usage: ./pipeline.sh "your project idea"
# Runs a Creative PM and Critical PM in a bounded loop until they converge on ideas.

IDEA="${1:-}"
if [ -z "$IDEA" ]; then
  echo "Usage: $0 \"your project idea\""
  exit 1
fi

MAX_ROUNDS=5
round=0
converged="false"
output="$IDEA"

# Set up HTML log file
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="pipeline_${TIMESTAMP}.html"

html_escape() {
  sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'
}

markdown_to_html() {
  # Bold: **text**
  sed \
    's/\*\*\([^*]*\)\*\*/<strong>\1<\/strong>/g; s/__\([^_]*\)__/<strong>\1<\/strong>/g' | \
  # Convert lines starting with ### ## # to headings
  sed \
    's/^### \(.*\)$/<h4>\1<\/h4>/; s/^## \(.*\)$/<h3>\1<\/h3>/; s/^# \(.*\)$/<h2>\1<\/h2>/' | \
  # Convert lines starting with - or * to list items (wrap in ul after)
  awk '
    /^[-*] / { in_list=1; sub(/^[-*] /, ""); print "<li>" $0 "</li>"; next }
    in_list && /^[^-*]/ { print "</ul>"; in_list=0 }
    { print }
    END { if (in_list) print "</ul>" }
  ' | \
  # Wrap <li> groups in <ul>
  awk '
    /<li>/ && !in_ul { print "<ul>"; in_ul=1 }
    !/<li>/ && in_ul { print "</ul>"; in_ul=0 }
    { print }
    END { if (in_ul) print "</ul>" }
  ' | \
  # Wrap plain text lines in <p> (not already in a tag)
  awk '
    /^</ { print; next }
    /^$/ { print "<br>"; next }
    { print "<p>" $0 "</p>" }
  '
}

# Write HTML header
cat > "$LOG_FILE" << 'HTML_HEADER'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PM Pipeline Log</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f5; color: #222; }

    header { background: #1a1a2e; color: white; padding: 24px 32px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    header h1 { font-size: 1.2rem; font-weight: 600; margin-bottom: 4px; }
    header .idea { font-size: 0.9rem; color: #aab; }

    nav { background: #16213e; padding: 10px 32px; display: flex; gap: 12px; flex-wrap: wrap; position: sticky; top: 72px; z-index: 99; border-bottom: 1px solid #0f3460; }
    nav a { color: #7ec8e3; font-size: 0.82rem; text-decoration: none; padding: 4px 10px; border-radius: 12px; border: 1px solid #0f3460; transition: background 0.15s; }
    nav a:hover { background: #0f3460; }

    main { max-width: 960px; margin: 32px auto; padding: 0 24px 64px; }

    .round { margin-bottom: 48px; }
    .round-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #ddd; }
    .round-badge { background: #1a1a2e; color: white; font-size: 0.8rem; font-weight: 700; padding: 4px 12px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .round-header h2 { font-size: 1.1rem; color: #555; font-weight: 500; }

    .agent-block { border-radius: 8px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
    .agent-label { padding: 10px 16px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 8px; }
    .agent-label .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .agent-content { padding: 20px 24px; background: white; font-size: 0.92rem; line-height: 1.7; }
    .agent-content h2, .agent-content h3, .agent-content h4 { margin: 16px 0 6px; color: #333; }
    .agent-content p { margin-bottom: 10px; }
    .agent-content ul { margin: 8px 0 12px 20px; }
    .agent-content li { margin-bottom: 6px; }
    .agent-content strong { color: #111; }
    .agent-content br { display: block; margin: 4px 0; }

    .creative .agent-label { background: #e8f4fd; color: #1565c0; }
    .creative .agent-label .dot { background: #1565c0; }
    .creative .agent-content { border-top: 3px solid #1565c0; }

    .critical .agent-label { background: #fce4ec; color: #ad1457; }
    .critical .agent-label .dot { background: #ad1457; }
    .critical .agent-content { border-top: 3px solid #ad1457; }

    .convergence { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 600; margin-top: 12px; }
    .convergence.yes { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
    .convergence.no  { background: #fff8e1; color: #f57f17; border: 1px solid #ffe082; }

    .summary { background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); border-left: 4px solid #1a1a2e; margin-bottom: 32px; }
    .summary h2 { font-size: 1rem; margin-bottom: 12px; color: #1a1a2e; }
    .summary p { font-size: 0.92rem; color: #444; line-height: 1.6; }

    .final-ideas { background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); border-left: 4px solid #1565c0; }
    .final-ideas h2 { font-size: 1rem; margin-bottom: 16px; color: #1565c0; }
    .final-ideas .content { font-size: 0.92rem; line-height: 1.7; }
    .final-ideas .content p { margin-bottom: 10px; }
    .final-ideas .content ul { margin: 8px 0 12px 20px; }
    .final-ideas .content li { margin-bottom: 6px; }
  </style>
</head>
<body>
HTML_HEADER

# Write the idea into the header (after we have it)
cat >> "$LOG_FILE" << HTML_HEADER2
  <header>
    <h1>PM Pipeline Log</h1>
    <div class="idea">Idea: $(echo "$IDEA" | html_escape)</div>
  </header>
  <nav id="nav">
    <a href="#summary">Summary</a>
    <a href="#final">Final Ideas</a>
  </nav>
  <main>
HTML_HEADER2

echo "=== Starting PM Pipeline ==="
echo "Idea: $IDEA"
echo "Log: $LOG_FILE"
echo ""

while [ "$converged" != "true" ] && [ "$round" -lt "$MAX_ROUNDS" ]; do
  round=$((round + 1))
  echo "--- Round $round ---"

  # Add nav link and open round section
  sed -i '' "s|<a href=\"#final\">|<a href=\"#round-${round}\">Round ${round}</a>\n    <a href=\"#final\">|" "$LOG_FILE"

  cat >> "$LOG_FILE" << HTML
    <div class="round" id="round-${round}">
      <div class="round-header">
        <span class="round-badge">Round ${round}</span>
        <h2>Ideation &amp; Evaluation</h2>
      </div>
HTML

  # Creative PM
  echo "[Creative PM] Generating ideas..."
  creative=$(claude -p "You are a Creative Product Manager specializing in ideation.

Current state of the ideas:
$output

Your task: Generate or refine a set of product feature ideas based on the above.
For each idea provide: a name, a 2-3 sentence description, the user value, and a rough complexity estimate (low/medium/high).
If this is not round 1, incorporate any critical feedback from the previous round.
Be imaginative and focus on user delight." \
    --output-format json | jq -r '.result')

  echo "[Creative PM] Done."

  creative_html=$(echo "$creative" | html_escape | markdown_to_html)
  cat >> "$LOG_FILE" << HTML
      <div class="agent-block creative">
        <div class="agent-label"><span class="dot"></span> Creative PM</div>
        <div class="agent-content">${creative_html}</div>
      </div>
HTML

  # Critical PM
  echo "[Critical PM] Evaluating ideas..."
  evaluation=$(claude -p "You are a Critical Product Manager who evaluates ideas rigorously.

Here are the current feature ideas to evaluate:
$creative

Your task:
1. Score each idea on feasibility (1-10), user impact (1-10), and effort (1-10).
2. Eliminate any ideas with fatal flaws and explain why.
3. Rank the remaining ideas.
4. Decide whether the ideas are good enough to move forward (converged) or need another round of refinement.

End your response with this JSON on its own line, with no other text on that line:
{\"converged\": true, \"feedback\": \"brief reason\"} or {\"converged\": false, \"feedback\": \"what needs improvement\"}" \
    --output-format json | jq -r '.result')

  echo "[Critical PM] Done."

  # Extract convergence signal
  json_line=$(echo "$evaluation" | grep -o '{"converged": *[a-z]*[^}]*}' | tail -1)
  converged=$(echo "$json_line" | jq -r '.converged // "false"' 2>/dev/null || echo "false")
  feedback=$(echo "$json_line" | jq -r '.feedback // ""' 2>/dev/null || echo "")

  echo "Converged: $converged"
  [ -n "$feedback" ] && echo "Feedback: $feedback"
  echo ""

  # Strip the JSON line from the evaluation before displaying
  evaluation_display=$(echo "$evaluation" | grep -v '{"converged":')
  evaluation_html=$(echo "$evaluation_display" | html_escape | markdown_to_html)

  if [ "$converged" = "true" ]; then
    convergence_html='<div class="convergence yes">&#10003; Converged</div>'
  else
    convergence_html="<div class=\"convergence no\">&#8635; Needs refinement &mdash; $(echo "$feedback" | html_escape)</div>"
  fi

  cat >> "$LOG_FILE" << HTML
      <div class="agent-block critical">
        <div class="agent-label"><span class="dot"></span> Critical PM</div>
        <div class="agent-content">${evaluation_html}${convergence_html}</div>
      </div>
    </div>
HTML

  output="Creative PM ideas:
$creative

Critical PM feedback:
$evaluation"

done

# Summary and final ideas
if [ "$converged" = "true" ]; then
  summary_text="Converged after ${round} round(s). The Critical PM determined the ideas were ready to move forward."
else
  summary_text="Reached the maximum of ${MAX_ROUNDS} rounds without full convergence. The ideas below represent the best state reached."
fi

final_html=$(echo "$creative" | html_escape | markdown_to_html)

cat >> "$LOG_FILE" << HTML
    <div class="summary" id="summary">
      <h2>Pipeline Summary</h2>
      <p>${summary_text}</p>
    </div>
    <div class="final-ideas" id="final">
      <h2>Final Ideas</h2>
      <div class="content">${final_html}</div>
    </div>
  </main>
</body>
</html>
HTML

echo "=== Pipeline Complete ==="
if [ "$converged" = "true" ]; then
  echo "Converged after $round round(s)."
else
  echo "Reached max rounds ($MAX_ROUNDS) without full convergence."
fi
echo ""
echo "Log saved to: $LOG_FILE"
echo "Open with: open $LOG_FILE"
