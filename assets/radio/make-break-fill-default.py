#!/usr/bin/env python3
"""Rebuild assets/radio/break-fill-default.wav.

Original synthesized placeholder bed for between-show breaks.
It is not a commercial recording and not a song from the catalog.
Partial frequencies and the tremolo are whole cycles over 12 seconds
so the file loops without a click.
"""
import math
import os
import struct
import wave

SR = 44100
SECONDS = 12
OUT = os.path.join(os.path.dirname(__file__), 'break-fill-default.wav')

def main():
    n = SR * SECONDS
    partials = []
    for freq, amp in (
        (130.8128, 0.22),
        (164.8138, 0.16),
        (196.0, 0.16),
        (261.6256, 0.09),
        (329.6276, 0.06),
        (98.0, 0.12),
    ):
        cycles = round(freq * SECONDS)
        partials.append((cycles / SECONDS, amp))
    samples = []
    peak = 0.0
    for i in range(n):
        t = i / SR
        env = 0.58 + 0.42 * math.sin(2 * math.pi * (4 / SECONDS) * t - math.pi / 2)
        acc = 0.0
        for freq, amp in partials:
            acc += amp * math.sin(2 * math.pi * freq * t)
        pulse_t = t % 3
        pulse = math.exp(-pulse_t * 6) * math.sin(2 * math.pi * (2 / 3) * t)
        acc = acc * env + pulse * 0.08
        samples.append(acc)
        peak = max(peak, abs(acc))
    scale = 0.7 / peak if peak else 1
    with wave.open(OUT, 'w') as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        frames = bytearray()
        for sample in samples:
            value = max(-1.0, min(1.0, sample * scale))
            frames += struct.pack('<h', int(value * 32767))
        handle.writeframes(frames)
    print(f'wrote {OUT} ({os.path.getsize(OUT)} bytes)')

if __name__ == '__main__':
    main()
