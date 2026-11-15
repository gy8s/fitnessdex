"""Tap an Android system UI node identified by the emulator's accessibility dump."""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET


DUMP = "/data/local/tmp/fitnessdex-window.xml"


def adb(*args):
    return subprocess.run(["adb", *args], check=True, capture_output=True, text=True).stdout


def tap_center(node):
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
    if not match:
        return False
    x1, y1, x2, y2 = map(int, match.groups())
    if x1 >= x2 or y1 >= y2:
        return False
    adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
    return True


def tap(pattern, attempts):
    for _ in range(attempts):
        adb("shell", "uiautomator", "dump", DUMP)
        root = ET.fromstring(adb("shell", "cat", DUMP))
        nodes = list(root.iter("node"))
        if any(node.get("text") == "Quickstep isn't responding" for node in nodes):
            close = next((node for node in nodes if node.get("text") == "Close app"), None)
            if close is not None and tap_center(close):
                print("Dismissed unrelated emulator launcher ANR")
                time.sleep(1)
                continue
        for node in nodes:
            labels = (node.get("text", ""), node.get("content-desc", ""))
            if node.get("enabled") != "true" or not any(pattern.fullmatch(label) for label in labels):
                continue
            if tap_center(node):
                print(f"Tapped Android UI: {next(label for label in labels if pattern.fullmatch(label))}")
                return True
        time.sleep(0.4)
    print("Visible Android UI labels:", [
        (node.get("text"), node.get("content-desc")) for node in nodes
        if node.get("text") or node.get("content-desc")
    ], file=sys.stderr)
    return False


if __name__ == "__main__":
    expression = re.compile(sys.argv[1], re.IGNORECASE)
    sys.exit(0 if tap(expression, int(sys.argv[2]) if len(sys.argv) > 2 else 5) else 1)
