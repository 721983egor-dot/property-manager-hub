#!/usr/bin/env python3
"""Verify a staged employee gateway in an isolated container."""
import json
import subprocess
import sys
from pathlib import Path

BASE = Path("/opt/rm-os-recovery/beget-production-20261115")
OVERLAY = Path("/opt/rm-os-recovery/ai-employees-20261125/polza-employee-overlay.json")
IMAGE = "rmos-beget-prod-app:employee-polza-20261125"
COMPOSE = [
    "docker", "compose", "-p", "rmos-beget-prod",
    "--env-file", str(BASE / "production.env"),
    "-f", str(BASE / "production.yml"), "-f", str(OVERLAY),
]
PROBE = """
const env = process.env;
const response = await fetch(env.AI_EMPLOYEES_GATEWAY_URL + "/chat/completions", {
  method: "POST",
  headers: {"Content-Type": "application/json", Authorization: "Bearer " + env.AI_EMPLOYEES_GATEWAY_KEY},
  signal: AbortSignal.timeout(25000),
  body: JSON.stringify({
    model: env.AI_EMPLOYEES_OPENAI_MODEL,
    store: false,
    messages: [{role: "user", content: "Synthetic RM OS draft test. Write a short greeting to a fictional guest."}],
    max_completion_tokens: 300,
    response_format: {type: "json_schema", json_schema: {
      name: "employee_draft", strict: true,
      schema: {type: "object", properties: {reply: {type: "string"}}, required: ["reply"], additionalProperties: false},
    }},
  }),
});
if (!response.ok) {
  console.error("Polza returned HTTP " + response.status);
  process.exit(1);
}
const body = await response.json();
const draft = JSON.parse(body.choices[0].message.content);
if (!draft.reply?.trim()) process.exit(2);
console.log("Polza returned a valid structured draft from the candidate image.");
"""

def main():
    config = json.loads(subprocess.check_output(COMPOSE + ["config", "--format", "json"]))
    app = config["services"]["app"]
    if app["image"] != IMAGE or app["environment"].get("AI_EMPLOYEES_PROVIDER") != "gateway":
        sys.exit("The configured candidate is incorrect.")
    subprocess.run(COMPOSE + [
        "run", "--no-deps", "--rm", "--pull=never", "-T", "--entrypoint", "node", "app",
        "--input-type=module", "-e", PROBE,
    ], check=True)

if __name__ == "__main__":
    main()
