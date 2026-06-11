# Project Rules

- Do not push changes unless the user explicitly asks to push.
- It is okay to make local edits, run checks, and create commits when requested, but leave remote publishing to an explicit user instruction.

## Local Environment Notes

- Node may not be available on `PATH` in a fresh Codex shell. The known working bundled Node runtime is:
  `/Users/guoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`
- When running project scripts, prefer that absolute Node path unless `node --version` already works in the current shell.
- The user's interactive zsh has been configured in `/Users/guoyu/.zshrc` to add that Node runtime to `PATH`, so a newly opened normal terminal should usually be able to run `node` directly.
- Quick Node check:
  ```sh
  /Users/guoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --version
  ```

## Network And DNS Notes

- In a fresh Codex chat/session, external network access may be restricted. When that happens, activity import and source discovery can fail with DNS errors such as `getaddrinfo ENOTFOUND`, `Could not resolve host`, or no DNS configuration from macOS network checks.
- This is usually a Codex network-permission issue, not necessarily a problem with the user's Wi-Fi or the target websites.
- For any task that needs external fetching, source discovery, address lookup, geocoding, business-hours lookup, or event import, proactively request network permission for the current Codex session before running the full command.
- If DNS/network fails, request network permission for the session before retrying external fetches. After permission is granted, verify with a small DNS/HTTP check before running a full import.
- Useful verification commands:
  ```sh
  python3 - <<'PY'
  import socket
  for host in ['ucnj.org', 'sclsnj.libnet.info', 'nominatim.openstreetmap.org']:
      try:
          print(host, socket.getaddrinfo(host, 443)[0][4][0])
      except Exception as e:
          print(host, type(e).__name__, e)
  PY

  curl -I -L --max-time 15 https://ucnj.org/trailside-nature-and-science-center/
  ```
- Once DNS works, rerun the relevant project command, for example:
  ```sh
  /Users/guoyu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/import-source-events.mjs --days 60
  ```
