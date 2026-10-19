"""Convert a Kokoro voice style tensor (.pt, e.g. from KVoiceWalk) to the raw float32 .bin
format that kokoro-js and the AI George Studio load in the browser.

Usage: python tools/pt_to_bin.py input.pt output.bin
"""
import sys

import numpy as np
import torch


def main(src: str, dst: str) -> None:
    t = torch.load(src, map_location="cpu")
    if isinstance(t, dict):  # some tools save {"voice": tensor} or similar
        t = next(v for v in t.values() if hasattr(v, "shape"))
    a = t.detach().float().cpu().numpy() if hasattr(t, "detach") else np.asarray(t, dtype=np.float32)
    a = a.reshape(-1, a.shape[-1])  # [510, 1, 256] -> [510, 256]
    if a.shape[-1] != 256 or a.shape[0] < 510:
        raise SystemExit(f"Unexpected shape {a.shape}; expected 510 x 256 (Kokoro v1.0 style table).")
    a[:510].astype("<f4").tofile(dst)
    print(f"Wrote {dst}: {a[:510].shape} float32, {a[:510].nbytes} bytes")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
