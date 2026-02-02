#!/usr/bin/env python3
import json
import time
import subprocess
import sys
from pprint import pp
# generates kubernetes secrets from 1Password items

vault_id = sys.argv[1]
item_name = sys.argv[2]
secret_name = sys.argv[3] if len(sys.argv) > 3 else item_name

result = subprocess.run(['op', 'item', 'get', item_name, '--reveal', '--vault', vault_id, '--format', 'json'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if result.returncode != 0:
    print(f"Error fetching item '{item_name}' from vault '{vault_id}':", file=sys.stderr)
    print(result.stderr.decode('utf-8'), file=sys.stderr)
    sys.exit(1)

secret = result.stdout.decode('utf-8')
if not secret.strip():
    print(f"Error: Empty response from 1Password for item '{item_name}'", file=sys.stderr)
    sys.exit(1)

try:
    content = json.loads(secret)
except json.JSONDecodeError as e:
    print(f"Error parsing JSON response: {e}", file=sys.stderr)
    print(f"Raw response: {secret[:500]}", file=sys.stderr)
    sys.exit(1)

print("apiVersion: v1")
print("kind: Secret")
print("metadata:")
print(f"  name: {secret_name}")
print("stringData:")

dupecheck = {}
for field in content["fields"]:
  key = field.get("label")
  value = field.get("value")
  if key in dupecheck:
    sys.exit(f"Error: duplicate key: {key}")
  dupecheck[key] = value 


for field in content['fields']:
  key = field.get("label")
  value = field.get("value")
  type = field.get("type")
  if type == "CONCEALED" and key != "password":
    print(f"  {key}: \"{value}\"")
