"""Read back rendered speech with local ASR; mismatches require review, not blind approval."""
from __future__ import annotations
import argparse
import difflib
import json
import os
from pathlib import Path
import re
import time

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

def normalized(text: str) -> str:
    return re.sub(r"[^\w\u3400-\u9fff]", "", text.lower())

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--voices", type=Path, default=Path("public/audio/voice"))
    parser.add_argument("--output", type=Path, default=Path("output/audio-qa/asr.json"))
    parser.add_argument("--limit", type=int, default=32)
    parser.add_argument("--input", type=Path, help="Only sample completed clips from this production queue")
    parser.add_argument("--wait", action="store_true", help="Wait for this input queue to return before sampling")
    args = parser.parse_args()
    if args.wait and not args.input:
        parser.error("--wait requires --input")
    queue = json.loads(args.input.read_text()) if args.input else None
    if args.wait:
        print(json.dumps({"phase": "waiting-for-queue", "cues": len(queue)}), flush=True)
        while True:
            current = json.loads((args.voices / "manifest.json").read_text())
            if all(current.get(cue["id"], {}).get("spokenText", current.get(cue["id"], {}).get("text")) == cue["text"]
                   and current[cue["id"]].get("speaker") == cue["speaker"]
                   and (args.voices / current[cue["id"]]["file"]).is_file() for cue in queue):
                break
            time.sleep(20)
    manifest = json.loads((args.voices / "manifest.json").read_text())
    reports = json.loads(args.output.read_text()) if args.output.exists() else {}
    rows = list(manifest.items())
    if args.input:
        wanted = {row["id"] for row in queue}
        rows = [(key, row) for key, row in rows if key in wanted]
    samples = []
    for speaker in sorted({row["speaker"] for _, row in rows}):
        group = sorted([(key, row) for key, row in rows if row["speaker"] == speaker], key=lambda item: len(item[1]["text"]))
        for position in [0, len(group)//4, len(group)//2, 3*len(group)//4, len(group)-1]:
            samples.append(group[position])
    samples.extend(sorted(rows, key=lambda item: (not bool(re.search(r"不|无|禁止|\d", item[1]["text"])), -len(item[1]["text"]))))
    seen = set()
    pending = []
    for key, row in samples:
        if key in seen or reports.get(key, {}).get("sha256") == row["sha256"]:
            continue
        seen.add(key); pending.append((key, row))
        if args.limit and len(pending) >= args.limit:
            break
    if not pending:
        print(json.dumps({"pending": 0})); return
    from mlx_audio.stt.utils import load_model
    model = load_model(str(args.model))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for key, row in pending:
        started = time.monotonic()
        result = model.generate(str(args.voices / row["file"]), language="Chinese", max_tokens=512, verbose=False)
        expected, actual = normalized(row.get("spokenText", row["text"])), normalized(result.text)
        ratio = difflib.SequenceMatcher(None, expected, actual, autojunk=False).ratio()
        critical_mismatches = [term for term in ("钾离子", "钠离子", "氯离子", "碳酸氢根")
                               if expected.count(term) != actual.count(term)]
        report = {"sha256": row["sha256"], "speaker": row["speaker"], "expected": row.get("spokenText", row["text"]), "transcript": result.text,
                  "similarity": round(ratio, 4), "status": "asr-matched" if ratio >= .92 and not critical_mismatches else "needs-listening",
                  "criticalMismatches": critical_mismatches, "seconds": round(time.monotonic()-started, 2)}
        reports[key] = report
        temporary = args.output.with_suffix(".tmp")
        temporary.write_text(json.dumps(reports, ensure_ascii=False, indent=2)+"\n")
        temporary.replace(args.output)
        print(json.dumps({"id": key, **report}, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
