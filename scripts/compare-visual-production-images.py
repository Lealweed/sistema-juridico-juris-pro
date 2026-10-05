"""Compare the real browser screenshots; requires Pillow in the local runtime."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageChops

before_path, after_path = map(Path, sys.argv[1:3])
before, after = (json.loads(path.read_text(encoding="utf-8")) for path in (before_path, after_path))
assert before["passed"] and after["passed"]
assert before["clock"] == after["clock"]
assert [case["id"] for case in before["cases"]] == [case["id"] for case in after["cases"]]
result = {"passed": True, "generatedAt": datetime.now(timezone.utc).isoformat(), "before": str(before_path), "after": str(after_path), "channelTolerance": 3, "cases": []}
for old, new in zip(before["cases"], after["cases"]):
    a, b = (Image.open(case["screenshot"]).convert("RGB") for case in (old, new))
    info = {"id": old["id"], "beforeSize": a.size, "afterSize": b.size}
    if a.size != b.size:
        info["passed"] = False
    else:
        difference = ImageChops.difference(a, b)
        values = list(difference.get_flattened_data())
        info.update(maxChannelDelta=max(max(pixel) for pixel in values), pixelsAboveTolerance=sum(max(pixel) > result["channelTolerance"] for pixel in values), meanChannelDelta=sum(sum(pixel) for pixel in values) / (3 * len(values)))
        info["passed"] = info["pixelsAboveTolerance"] == 0
        if not info["passed"]:
            difference.save(after_path.parent / (old["id"] + "-difference.png"))
    result["passed"] = result["passed"] and info["passed"]
    result["cases"].append(info)
report = after_path.parent / "visual-image-comparison.json"
report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"passed": result["passed"], "cases": len(result["cases"]), "maxChannelDelta": max(case.get("maxChannelDelta", 0) for case in result["cases"]), "pixelsAboveTolerance": sum(case.get("pixelsAboveTolerance", 0) for case in result["cases"]), "report": str(report)}))
sys.exit(0 if result["passed"] else 1)
