import struct
import sys


def presets(path):
    with open(path, "rb") as f:
        data = f.read(12)
        assert data[:4] == b"RIFF"
        size = struct.unpack("<I", data[4:8])[0]
        end = 8 + size
        pos = 12
        while pos < end:
            f.seek(pos)
            cid, csize = struct.unpack("<4sI", f.read(8))
            if cid == b"LIST":
                kind = f.read(4)
                if kind == b"pdta":
                    sub = pos + 12
                    stop = pos + 8 + csize
                    while sub < stop:
                        f.seek(sub)
                        sid, ssize = struct.unpack("<4sI", f.read(8))
                        if sid == b"phdr":
                            raw = f.read(ssize)
                            out = []
                            for i in range(ssize // 38 - 1):
                                rec = raw[i * 38 : (i + 1) * 38]
                                name = rec[:20].split(b"\0")[0].decode("latin1")
                                preset, bank = struct.unpack("<HH", rec[20:24])
                                out.append((bank, preset, name))
                            return sorted(out)
                        sub += 8 + ssize + (ssize & 1)
            pos += 8 + csize + (csize & 1)
    return []


if __name__ == "__main__":
    for b, p, n in presets(sys.argv[1]):
        print(f"{b:3d}:{p:3d} {n}")
