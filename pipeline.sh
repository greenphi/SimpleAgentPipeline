#!/bin/bash
set -euo pipefail

# Usage: ./pipeline.sh "your project idea"
# Full pipeline: PM ideation → spec → plan → tests → implementation

IDEA="${1:-}"
if [ -z "$IDEA" ]; then
  echo "Usage: $0 \"your project idea\""
  exit 1
fi

MAX_PM_ROUNDS=5
MAX_ENGINEER_ROUNDS=5
round=0
converged="false"
output="$IDEA"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Choose a project folder name based on the idea
echo "Choosing project name..."
PROJECT_NAME=$(claude -p "Given this project idea, output a short kebab-case folder name (2-4 words, lowercase, hyphens only, no special characters, no quotes):

$IDEA

Output the folder name only, nothing else." --output-format json | jq -r '.result' | tr -cd 'a-z0-9-' | sed 's/^-//;s/-$//')

if [ -z "$PROJECT_NAME" ]; then
  PROJECT_NAME="project"
fi

PROJECT_DIR="${PROJECT_NAME}_${TIMESTAMP}"
LOG_FILE="pipeline_${PROJECT_NAME}_${TIMESTAMP}.html"

echo "Project directory: $PROJECT_DIR"
mkdir -p "$PROJECT_DIR"
PROJECT_ABS="$(pwd)/$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

html_escape() {
  sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'
}

markdown_to_html() {
  sed \
    's/\*\*\([^*]*\)\*\*/<strong>\1<\/strong>/g; s/__\([^_]*\)__/<strong>\1<\/strong>/g' | \
  sed \
    's/^### \(.*\)$/<h4>\1<\/h4>/; s/^## \(.*\)$/<h3>\1<\/h3>/; s/^# \(.*\)$/<h2>\1<\/h2>/' | \
  awk '
    /^[-*] / { in_list=1; sub(/^[-*] /, ""); print "<li>" $0 "</li>"; next }
    in_list && /^[^-*]/ { print "</ul>"; in_list=0 }
    { print }
    END { if (in_list) print "</ul>" }
  ' | \
  awk '
    /<li>/ && !in_ul { print "<ul>"; in_ul=1 }
    !/<li>/ && in_ul { print "</ul>"; in_ul=0 }
    { print }
    END { if (in_ul) print "</ul>" }
  ' | \
  awk '
    /^</ { print; next }
    /^$/ { print "<br>"; next }
    { print "<p>" $0 "</p>" }
  '
}

# Append a single-agent block to the HTML log
# Usage: append_agent_block <css-class> <label> <content-var> [<badge-html>]
append_agent_block() {
  local css_class="$1"
  local label="$2"
  local content="$3"
  local badge="${4:-}"
  local content_html
  content_html=$(echo "$content" | html_escape | markdown_to_html)
  cat >> "$LOG_FILE" << HTML
      <div class="agent-block ${css_class}">
        <div class="agent-label"><span class="dot"></span> ${label}</div>
        <div class="agent-content">${content_html}${badge}</div>
      </div>
HTML
}

# Add a nav link before #summary
add_nav_link() {
  local anchor="$1"
  local label="$2"
  sed -i '' "s|<a href=\"#summary\">|<a href=\"#${anchor}\">${label}</a>\n    <a href=\"#summary\">|" "$LOG_FILE"
}

# Wrap a section in the HTML log
open_section() {
  local anchor="$1"
  local badge_label="$2"
  local heading="$3"
  cat >> "$LOG_FILE" << HTML
    <div class="round" id="${anchor}">
      <div class="round-header">
        <span class="round-badge">${badge_label}</span>
        <h2>${heading}</h2>
      </div>
HTML
}

close_section() {
  echo "    </div>" >> "$LOG_FILE"
}

# ---------------------------------------------------------------------------
# HTML scaffold
# ---------------------------------------------------------------------------

cat > "$LOG_FILE" << 'HTML_HEADER'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Pipeline Log</title>
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
    pre { background: #f0f0f0; border-radius: 4px; padding: 12px 16px; overflow-x: auto; font-size: 0.85rem; margin: 10px 0; white-space: pre-wrap; word-break: break-all; }

    /* Agent colour themes */
    .creative .agent-label  { background: #e8f4fd; color: #1565c0; }
    .creative .agent-label .dot { background: #1565c0; }
    .creative .agent-content { border-top: 3px solid #1565c0; }

    .critical .agent-label  { background: #fce4ec; color: #ad1457; }
    .critical .agent-label .dot { background: #ad1457; }
    .critical .agent-content { border-top: 3px solid #ad1457; }

    .spec-agent .agent-label  { background: #f3e5f5; color: #6a1b9a; }
    .spec-agent .agent-label .dot { background: #6a1b9a; }
    .spec-agent .agent-content { border-top: 3px solid #6a1b9a; }

    .plan-agent .agent-label  { background: #e8eaf6; color: #283593; }
    .plan-agent .agent-label .dot { background: #283593; }
    .plan-agent .agent-content { border-top: 3px solid #283593; }

    .testplan-agent .agent-label  { background: #fff3e0; color: #e65100; }
    .testplan-agent .agent-label .dot { background: #e65100; }
    .testplan-agent .agent-content { border-top: 3px solid #e65100; }

    .qa-agent .agent-label  { background: #fff8e1; color: #f57f17; }
    .qa-agent .agent-label .dot { background: #f57f17; }
    .qa-agent .agent-content { border-top: 3px solid #f57f17; }

    .engineer-agent .agent-label  { background: #e8f5e9; color: #1b5e20; }
    .engineer-agent .agent-label .dot { background: #1b5e20; }
    .engineer-agent .agent-content { border-top: 3px solid #1b5e20; }

    .test-results .agent-label  { background: #f1f8e9; color: #33691e; }
    .test-results .agent-label .dot { background: #33691e; }
    .test-results.fail .agent-label  { background: #fbe9e7; color: #bf360c; }
    .test-results.fail .agent-label .dot { background: #bf360c; }
    .test-results .agent-content { border-top: 3px solid #33691e; }
    .test-results.fail .agent-content { border-top: 3px solid #bf360c; }

    .convergence { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 600; margin-top: 12px; }
    .convergence.yes   { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
    .convergence.no    { background: #fff8e1; color: #f57f17; border: 1px solid #ffe082; }
    .convergence.error { background: #fbe9e7; color: #bf360c; border: 1px solid #ffccbc; }
    .convergence.pass  { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
    .convergence.fail  { background: #fbe9e7; color: #bf360c; border: 1px solid #ffccbc; }

    .summary { background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); border-left: 4px solid #1a1a2e; margin-bottom: 32px; }
    .summary h2 { font-size: 1rem; margin-bottom: 12px; color: #1a1a2e; }
    .summary p { font-size: 0.92rem; color: #444; line-height: 1.6; }

    .final-ideas { background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); border-left: 4px solid #1565c0; margin-bottom: 32px; }
    .final-ideas h2 { font-size: 1rem; margin-bottom: 16px; color: #1565c0; }
    .final-ideas .content { font-size: 0.92rem; line-height: 1.7; }
    .final-ideas .content p { margin-bottom: 10px; }
    .final-ideas .content ul { margin: 8px 0 12px 20px; }
    .final-ideas .content li { margin-bottom: 6px; }
  </style>
</head>
<body>
HTML_HEADER

cat >> "$LOG_FILE" << HTML_HEADER2
  <header>
    <h1>Agent Pipeline Log</h1>
    <div class="idea">Idea: $(echo "$IDEA" | html_escape)</div>
  </header>
  <nav id="nav">
    <a href="#summary">Summary</a>
  </nav>
  <main>
HTML_HEADER2

# Add the static nav links up front so add_nav_link insertions work
sed -i '' "s|<a href=\"#summary\">|<a href=\"#final\">Final Ideas</a>\n    <a href=\"#summary\">|" "$LOG_FILE"

echo "=== Starting Agent Pipeline ==="
echo "Idea: $IDEA"
echo "Log:  $LOG_FILE"
echo ""

# ---------------------------------------------------------------------------
# Phase 1: PM Ideation Loop
# ---------------------------------------------------------------------------

while [ "$converged" != "true" ] && [ "$round" -lt "$MAX_PM_ROUNDS" ]; do
  round=$((round + 1))
  echo "--- PM Round $round ---"

  add_nav_link "round-${round}" "PM Round ${round}"
  open_section "round-${round}" "Round ${round}" "Ideation &amp; Evaluation"

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

  append_agent_block "creative" "Creative PM" "$creative"

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

  json_line=$(echo "$evaluation" | grep -o '{"converged": *[a-z]*[^}]*}' | tail -1)
  converged=$(echo "$json_line" | jq -r '.converged // "false"' 2>/dev/null || echo "false")
  feedback=$(echo "$json_line" | jq -r '.feedback // ""' 2>/dev/null || echo "")

  echo "Converged: $converged"
  [ -n "$feedback" ] && echo "Feedback: $feedback"
  echo ""

  evaluation_display=$(echo "$evaluation" | grep -v '{"converged":')
  if [ "$converged" = "true" ]; then
    badge='<div class="convergence yes">&#10003; Converged</div>'
  else
    badge="<div class=\"convergence no\">&#8635; Needs refinement &mdash; $(echo "$feedback" | html_escape)</div>"
  fi
  append_agent_block "critical" "Critical PM" "$evaluation_display" "$badge"
  close_section

  output="Creative PM ideas:
$creative

Critical PM feedback:
$evaluation"
done

# ---------------------------------------------------------------------------
# Convergence gate
# ---------------------------------------------------------------------------

if [ "$converged" != "true" ]; then
  echo "ERROR: PM ideation did not converge after $MAX_PM_ROUNDS rounds. Stopping."

  cat >> "$LOG_FILE" << HTML
    <div class="summary" id="summary">
      <h2>Pipeline Stopped</h2>
      <p>PM ideation did not converge after ${MAX_PM_ROUNDS} rounds. No specification or code was produced.</p>
    </div>
  </main>
</body>
</html>
HTML

  echo "Log saved to: $LOG_FILE"
  exit 1
fi

echo ""
echo "=== PM ideation converged. Proceeding to build pipeline. ==="
echo ""

# Write final ideas to HTML
final_html=$(echo "$creative" | html_escape | markdown_to_html)
cat >> "$LOG_FILE" << HTML
    <div class="final-ideas" id="final">
      <h2>Final Ideas (from PM Loop)</h2>
      <div class="content">${final_html}</div>
    </div>
HTML

echo ""

# ---------------------------------------------------------------------------
# Phase 2: Specification
# ---------------------------------------------------------------------------

echo "=== [Spec Agent] Writing SPEC.md ==="
add_nav_link "phase-spec" "Spec"
open_section "phase-spec" "Spec Agent" "Project Specification"

spec=$(claude -p "You are a senior product manager and technical writer.

Here are the converged product feature ideas you must turn into a specification:
$creative

Write a comprehensive project specification in Markdown. Include:
- Project overview and goals
- Target users and personas
- Core features for MVP (be specific and concrete)
- Future / post-MVP features
- User stories for each MVP feature
- Functional requirements
- Non-functional requirements (performance, security, accessibility)
- Explicitly out-of-scope items

Be thorough. This document will drive the implementation plan and tests." \
  --allowedTools "Read,Glob,Grep" \
  --output-format json | jq -r '.result')

echo "$spec" > "$PROJECT_DIR/SPEC.md"
echo "[Spec Agent] Done. Written to $PROJECT_DIR/SPEC.md"

append_agent_block "spec-agent" "Spec Agent" "$spec"
close_section

# ---------------------------------------------------------------------------
# Phase 3: Implementation Plan
# ---------------------------------------------------------------------------

echo "=== [Plan Agent] Writing PLAN.md ==="
add_nav_link "phase-plan" "Plan"
open_section "phase-plan" "Plan Agent" "Implementation Plan"

plan=$(claude -p "You are a senior software architect.

Here is the project specification:
$(cat "$PROJECT_DIR/SPEC.md")

Write a detailed technical implementation plan in Markdown. Include:
- Chosen tech stack with rationale (be specific: language, frameworks, libraries)
- Directory and file structure
- Data models / schema
- Key components and their responsibilities
- API design (if applicable)
- Implementation phases, each with concrete deliverables
- Dependencies between phases
- A 'run_tests.sh' script specification: exactly what command(s) to run to execute all tests

The tech stack choices must be concrete enough that an engineer can start immediately." \
  --allowedTools "Read,Glob,Grep" \
  --output-format json | jq -r '.result')

echo "$plan" > "$PROJECT_DIR/PLAN.md"
echo "[Plan Agent] Done. Written to $PROJECT_DIR/PLAN.md"

append_agent_block "plan-agent" "Plan Agent" "$plan"
close_section

# ---------------------------------------------------------------------------
# Phase 4: Test Plan
# ---------------------------------------------------------------------------

echo "=== [Test Plan Agent] Writing TESTPLAN.md ==="
add_nav_link "phase-testplan" "Test Plan"
open_section "phase-testplan" "Test Plan Agent" "Testing Plan"

testplan=$(claude -p "You are a senior QA engineer.

Here is the project specification:
$(cat "$PROJECT_DIR/SPEC.md")

Here is the implementation plan:
$(cat "$PROJECT_DIR/PLAN.md")

Write a comprehensive testing plan in Markdown. Include:
- Testing philosophy and approach
- For each MVP feature: specific unit test cases (function/component level)
- Integration test cases (end-to-end flows)
- Edge cases and error conditions to cover
- Test file names and locations (matching the directory structure in PLAN.md)
- The exact test runner command (must match what will go in run_tests.sh)" \
  --allowedTools "Read,Glob,Grep" \
  --output-format json | jq -r '.result')

echo "$testplan" > "$PROJECT_DIR/TESTPLAN.md"
echo "[Test Plan Agent] Done. Written to $PROJECT_DIR/TESTPLAN.md"

append_agent_block "testplan-agent" "Test Plan Agent" "$testplan"
close_section

# ---------------------------------------------------------------------------
# Phase 5: QA Agent — write the tests
# ---------------------------------------------------------------------------

echo "=== [QA Agent] Writing tests ==="
add_nav_link "phase-qa" "QA"
open_section "phase-qa" "QA Agent" "Test Implementation"

qa_output=$(claude -p "You are a senior QA engineer. Your job is to write the tests ONLY — do not write any implementation code.

Project directory: $PROJECT_DIR

You have three reference documents:
- SPEC.md: $(cat "$PROJECT_DIR/SPEC.md")
- PLAN.md: $(cat "$PROJECT_DIR/PLAN.md")
- TESTPLAN.md: $(cat "$PROJECT_DIR/TESTPLAN.md")

Your tasks:
1. Create all test files described in TESTPLAN.md inside $PROJECT_DIR, following the directory structure in PLAN.md.
2. Write thorough tests for every case in TESTPLAN.md. Import implementation modules as specified in PLAN.md (they do not exist yet — that is expected and fine).
3. Create $PROJECT_DIR/run_tests.sh — an executable shell script that installs any test dependencies and runs the full test suite. It must exit 0 on success and non-zero on failure.

Write real, runnable tests. Do not use placeholders." \
  --allowedTools "Read,Glob,Grep,Write(${PROJECT_ABS}/**),Edit(${PROJECT_ABS}/**),Bash" \
  --output-format json | jq -r '.result')

echo "[QA Agent] Done."

append_agent_block "qa-agent" "QA Agent" "$qa_output"
close_section

# Make sure run_tests.sh is executable
if [ -f "$PROJECT_DIR/run_tests.sh" ]; then
  chmod +x "$PROJECT_DIR/run_tests.sh"
fi

# ---------------------------------------------------------------------------
# Phase 6: Engineer Loop — write code until tests pass
# ---------------------------------------------------------------------------

echo ""
echo "=== [Engineer] Implementing until tests pass (max $MAX_ENGINEER_ROUNDS rounds) ==="
add_nav_link "phase-engineer" "Engineer"

engineer_round=0
tests_passed="false"
test_output=""

while [ "$tests_passed" != "true" ] && [ "$engineer_round" -lt "$MAX_ENGINEER_ROUNDS" ]; do
  engineer_round=$((engineer_round + 1))
  echo "--- Engineer Round $engineer_round ---"

  open_section "engineer-round-${engineer_round}" "Engineer Round ${engineer_round}" "Implementation"

  # Build the prompt — include test failure output on subsequent rounds
  if [ "$engineer_round" -eq 1 ]; then
    failure_context="This is the first implementation attempt."
  else
    failure_context="The previous implementation attempt failed. Here is the test output:

$test_output

Fix the failing tests. Do not modify the test files."
  fi

  engineer_output=$(claude -p "You are a senior software engineer.

Project directory: $PROJECT_DIR

Reference documents:
- SPEC.md: $(cat "$PROJECT_DIR/SPEC.md")
- PLAN.md: $(cat "$PROJECT_DIR/PLAN.md")

$failure_context

Your tasks:
1. Implement all code described in PLAN.md inside $PROJECT_DIR. Follow the directory structure, tech stack, and data models exactly.
2. Do NOT modify any test files.
3. Make all tests in the test suite pass.

Write complete, production-quality code." \
    --allowedTools "Read,Glob,Grep,Write(${PROJECT_ABS}/**),Edit(${PROJECT_ABS}/**),Bash" \
    --output-format json | jq -r '.result')

  echo "[Engineer] Done. Running tests..."
  append_agent_block "engineer-agent" "Software Engineer" "$engineer_output"

  # Run the tests
  if bash "$PROJECT_DIR/run_tests.sh" > /tmp/test_run_output.txt 2>&1; then
    tests_passed="true"
    test_output=$(cat /tmp/test_run_output.txt)
    badge='<div class="convergence pass">&#10003; All tests passing</div>'
    test_result_class="test-results"
    echo "Tests PASSED."
  else
    test_output=$(cat /tmp/test_run_output.txt)
    badge="<div class=\"convergence fail\">&#10007; Tests failed (round ${engineer_round}/${MAX_ENGINEER_ROUNDS})</div>"
    test_result_class="test-results fail"
    echo "Tests FAILED. Output:"
    echo "$test_output"
  fi

  test_output_html=$(echo "$test_output" | html_escape)
  cat >> "$LOG_FILE" << HTML
      <div class="agent-block ${test_result_class}">
        <div class="agent-label"><span class="dot"></span> Test Results</div>
        <div class="agent-content"><pre>${test_output_html}</pre>${badge}</div>
      </div>
HTML
  close_section

  echo ""
done

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------

if [ "$tests_passed" = "true" ]; then
  summary_text="Pipeline completed successfully. PM ideation converged after ${round} round(s). All tests passed after ${engineer_round} engineering round(s). Project written to ${PROJECT_DIR}/."
  echo "=== Pipeline Complete: All tests passing after $engineer_round round(s). ==="
else
  summary_text="Engineer loop reached the maximum of ${MAX_ENGINEER_ROUNDS} rounds without all tests passing. Partial implementation is in ${PROJECT_DIR}/. Review the final test output for remaining failures."
  echo "=== Pipeline stopped: max engineer rounds ($MAX_ENGINEER_ROUNDS) reached without full test pass. ==="
fi

cat >> "$LOG_FILE" << HTML
    <div class="summary" id="summary">
      <h2>Pipeline Summary</h2>
      <p>${summary_text}</p>
    </div>
  </main>
</body>
</html>
HTML

echo ""
echo "Log saved to: $LOG_FILE"
echo "Project:      $PROJECT_DIR/"
echo "Open with:    open $LOG_FILE"
