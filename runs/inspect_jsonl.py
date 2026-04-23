import json
import os

base = "/mnt/c/Users/David Hill/iCloudDrive/GWU/Dissertation/reducing-technical-debt-praxis-experiment/runs"
files = [
    f"{base}/job-2addc568-3c83-45a0-bc4a-9eef98cfa2ce-output.jsonl",
    f"{base}/job-c352e2fa-e9e0-47e7-a629-0a24fcaa7ab9-output.jsonl",
]

for fpath in files:
    print(f"\n=== {os.path.basename(fpath)} ===")
    rows = []
    parse_errors = 0
    with open(fpath, errors="replace") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                parse_errors += 1
                if parse_errors <= 3:
                    print(f"  JSON parse error on line {i}: {e}")
                try:
                    rows.append(json.loads(line, strict=False))
                    parse_errors -= 1  # recovered
                except Exception:
                    pass
    if parse_errors:
        print(f"  Total unrecoverable JSON parse errors: {parse_errors}")
    print(f"Total rows: {len(rows)}")
    if not rows:
        continue

    print(f"Sample keys: {list(rows[0].keys())[:10]}")

    def get_body(r):
        """Response body is at response.body (batch API format)."""
        resp = r.get("response", {})
        if isinstance(resp, dict):
            if "body" in resp:
                return resp["body"]
            return resp  # fallback: flat format
        return {}

    def get_status_code(r):
        resp = r.get("response", {})
        if isinstance(resp, dict):
            return resp.get("status_code")
        return None

    # HTTP-level errors (non-200 status codes)
    http_errors = [r for r in rows if get_status_code(r) and get_status_code(r) != 200]
    print(f"Rows with non-200 status code: {len(http_errors)}")
    status_codes = {}
    for r in rows:
        sc = get_status_code(r) or "missing"
        status_codes[sc] = status_codes.get(sc, 0) + 1
    print(f"Status code breakdown: {status_codes}")

    # Top-level errors (error field on row itself)
    top_errors = [r for r in rows if r.get("error")]
    body_errors = [r for r in rows if get_body(r).get("error")]
    print(f"Rows with top-level errors: {len(top_errors)}")
    print(f"Rows with body-level errors: {len(body_errors)}")
    if top_errors:
        print("  Sample top-level error:", json.dumps(top_errors[0]["error"])[:300])
    if body_errors:
        print("  Sample body error:", json.dumps(get_body(body_errors[0])["error"])[:300])

    # Finish reasons
    finish_reasons = {}
    for r in rows:
        body = get_body(r)
        choices = body.get("choices", [])
        if choices:
            fr = choices[0].get("finish_reason", "unknown")
            finish_reasons[fr] = finish_reasons.get(fr, 0) + 1
        elif body.get("error"):
            finish_reasons["body_error"] = finish_reasons.get("body_error", 0) + 1
        else:
            finish_reasons["no_choices"] = finish_reasons.get("no_choices", 0) + 1
    print(f"Finish reasons: {finish_reasons}")

    # Empty or missing content
    empty_ids = []
    for r in rows:
        body = get_body(r)
        choices = body.get("choices", [])
        if choices:
            content = choices[0].get("message", {}).get("content", "")
            if not content or not content.strip():
                empty_ids.append(r.get("custom_id", r.get("id", "?")))
    print(f"Empty content rows: {len(empty_ids)}")
    if empty_ids[:10]:
        print(f"  Sample IDs: {empty_ids[:10]}")

    # custom_id pattern check
    custom_ids = [r.get("custom_id", "") for r in rows]
    print(f"custom_id sample: {custom_ids[:5]}")
    missing_custom_id = sum(1 for c in custom_ids if not c)
    print(f"Rows missing custom_id: {missing_custom_id}")

    # Length-truncated responses
    length_truncated = []
    for r in rows:
        body = get_body(r)
        choices = body.get("choices", [])
        if choices and choices[0].get("finish_reason") == "length":
            length_truncated.append(r)
    print(f"Truncated (finish_reason=length): {len(length_truncated)}")
    if length_truncated[:3]:
        for t in length_truncated[:3]:
            content = get_body(t)["choices"][0].get("message", {}).get("content", "")
            print(f"  custom_id={t.get('custom_id')} content_len={len(content)}")

    # Content length stats for successful rows
    content_lengths = []
    for r in rows:
        body = get_body(r)
        choices = body.get("choices", [])
        if choices:
            content = choices[0].get("message", {}).get("content", "")
            content_lengths.append(len(content))
    if content_lengths:
        content_lengths.sort()
        n = len(content_lengths)
        print(f"Content length stats (n={n}): min={content_lengths[0]}, median={content_lengths[n//2]}, max={content_lengths[-1]}")
        # Flag suspiciously short (< 100 chars) that aren't empty
        short = [r for r in rows if 0 < len((get_body(r).get("choices") or [{}])[0].get("message", {}).get("content", "")) < 100]
        print(f"Suspiciously short content (<100 chars): {len(short)}")
        for s in short[:5]:
            cid = s.get("custom_id")
            content = (get_body(s).get("choices") or [{}])[0].get("message", {}).get("content", "")
            print(f"  custom_id={cid}: {repr(content[:120])}")
