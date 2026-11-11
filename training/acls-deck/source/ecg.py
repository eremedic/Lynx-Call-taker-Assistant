"""Synthetic teaching ECG strips (lead II style) on standard ECG paper."""
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import os

FS = 500
DUR = 6.0
rng = np.random.default_rng(7)
t = np.arange(0, DUR, 1 / FS)
OUT = os.path.join(os.path.dirname(__file__), "strips")
os.makedirs(OUT, exist_ok=True)


def g(center, amp, width):
    return amp * np.exp(-((t - center) ** 2) / (2 * width ** 2))


def P(tc, amp=0.2, w=0.022):
    return g(tc, amp, w)


def QRS(tc, wide=False, amp=1.1):
    k = 2.6 if wide else 1.0
    y = g(tc - 0.022 * k, -0.12, 0.008 * k) + g(tc, amp, 0.010 * k) + g(tc + 0.024 * k, -0.28, 0.009 * k)
    tw = 0.30 if not wide else 0.36
    tamp = 0.28 if not wide else -0.35
    y += g(tc + tw, tamp, 0.045 if not wide else 0.06)
    return y


def baseline(noise=0.008):
    return 0.03 * np.sin(2 * np.pi * 0.25 * t) + rng.normal(0, noise, t.size)


def conducted(p_times, prs, wide=False, pamp=None):
    y = np.zeros_like(t)
    for i, (pt, pr) in enumerate(zip(p_times, prs)):
        a = 0.2 if pamp is None else pamp[i]
        y += P(pt, a)
        if pr is not None:
            y += QRS(pt + pr, wide)
    return y


def rhythms():
    R = {}
    # Normal sinus rhythm 75
    pt = np.arange(0.2, DUR, 0.8)
    R["nsr"] = conducted(pt, [0.16] * len(pt))
    # Sinus bradycardia 45
    pt = np.arange(0.3, DUR, 1.33)
    R["brady"] = conducted(pt, [0.16] * len(pt))
    # 1st degree AVB
    pt = np.arange(0.1, DUR, 0.86)
    R["avb1"] = conducted(pt, [0.32] * len(pt))
    # 2nd degree type I (Wenckebach) 4:3
    pt = np.arange(0.1, DUR, 0.68)
    cyc = [0.18, 0.28, 0.35, None]
    R["avb2i"] = conducted(pt, [cyc[i % 4] for i in range(len(pt))])
    # 2nd degree type II (3:2 / 4:3) constant PR, wide QRS
    pt = np.arange(0.1, DUR, 0.66)
    cyc = [0.18, 0.18, None]
    R["avb2ii"] = conducted(pt, [cyc[i % 3] for i in range(len(pt))], wide=True)
    # 3rd degree: P 90/min, ventricular escape 38/min wide
    y = np.zeros_like(t)
    for p in np.arange(0.15, DUR, 0.667):
        y += P(p)
    for q in np.arange(0.55, DUR, 1.58):
        y += QRS(q, wide=True)
    R["avb3"] = y
    # PAC
    y = np.zeros_like(t)
    beats = [0.2, 1.0, 1.8, 2.42, 3.4, 4.2, 5.0, 5.8]
    for i, b in enumerate(beats):
        if i == 3:
            y += P(b, 0.2, 0.016) + g(b + 0.02, -0.07, 0.01) + QRS(b + 0.14)
        elif b + 0.16 < DUR:
            y += P(b) + QRS(b + 0.16)
    R["pac"] = y
    # MAT: irregular ~120, varying P morphologies (>=3)
    y = np.zeros_like(t)
    b = 0.1
    shapes = [(0.2, 0.022), (-0.15, 0.02), (0.28, 0.014), (0.1, 0.03)]
    i = 0
    while b < DUR - 0.2:
        a, w = shapes[i % 4]
        pr = [0.14, 0.18, 0.12, 0.2][i % 4]
        y += P(b, a, w) + QRS(b + pr)
        b += [0.46, 0.58, 0.42, 0.62, 0.5][i % 5]
        i += 1
    R["mat"] = y
    # SVT ~180, P buried
    y = np.zeros_like(t)
    for q in np.arange(0.15, DUR, 0.333):
        y += g(q - 0.022, -0.1, 0.008) + g(q, 1.0, 0.01) + g(q + 0.024, -0.3, 0.009) + g(q + 0.19, 0.22, 0.035)
    R["svt"] = y
    # Atrial flutter 300 atrial, 4:1
    ph = (t * 5.0) % 1.0
    saw = np.where(ph < 0.8, -0.22 * (ph / 0.8), -0.22 + 0.22 * ((ph - 0.8) / 0.2)) + 0.11
    y = saw.copy()
    for q in np.arange(0.17, DUR, 0.8):
        y += g(q - 0.022, -0.1, 0.008) + g(q, 1.05, 0.01) + g(q + 0.024, -0.28, 0.009)
    R["flutter"] = y
    # Atrial fibrillation (controlled ~90, irregularly irregular)
    def af(rr_lo, rr_hi, seed):
        r = np.random.default_rng(seed)
        y = np.zeros_like(t)
        for f in (6.3, 7.7, 9.1, 5.1):
            y += 0.035 * np.sin(2 * np.pi * f * t + r.uniform(0, 6)) * (1 + 0.5 * np.sin(2 * np.pi * 0.7 * t + r.uniform(0, 6)))
        q = 0.2
        while q < DUR:
            y += g(q - 0.022, -0.1, 0.008) + g(q, 1.05, 0.01) + g(q + 0.024, -0.28, 0.009) + g(q + 0.28, 0.2, 0.045)
            q += r.uniform(rr_lo, rr_hi)
        return y
    R["afib"] = af(0.45, 1.05, 3)
    R["afib_rvr"] = af(0.32, 0.55, 11)
    # VF coarse
    y = np.zeros_like(t)
    for f, a in ((4.1, 0.45), (5.3, 0.35), (6.7, 0.22), (3.3, 0.25)):
        y += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * (0.6 + 0.4 * np.sin(2 * np.pi * rng.uniform(0.2, 0.5) * t))
    R["vf"] = y
    # Monomorphic VT ~180
    y = 0.15 + 0.7 * np.sin(2 * np.pi * 3.0 * t) + 0.2 * np.sin(2 * np.pi * 6.0 * t + 1)
    R["vt"] = y
    # Asystole
    R["asystole"] = 0.04 * np.sin(2 * np.pi * 0.18 * t)
    return R


def draw(name, y, noise=True):
    if noise:
        y = y + baseline()
    fig = plt.figure(figsize=(12, 1.92), dpi=200)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, DUR)
    ax.set_ylim(-0.9, 1.5)
    for x in np.arange(0, DUR + 0.001, 0.04):
        major = abs((x / 0.2) - round(x / 0.2)) < 1e-6
        ax.axvline(x, color="#E7A1AD" if major else "#F8DCE1", lw=1.0 if major else 0.5, zorder=0)
    for v in np.arange(-0.9, 1.501, 0.1):
        major = abs((v / 0.5) - round(v / 0.5)) < 1e-6
        ax.axhline(v, color="#E7A1AD" if major else "#F8DCE1", lw=1.0 if major else 0.5, zorder=0)
    ax.set_facecolor("#FFF7F8")
    ax.plot(t, y, color="#1B1F2A", lw=1.6, zorder=2)
    ax.axis("off")
    fig.savefig(os.path.join(OUT, name + ".png"), facecolor="#FFF7F8")
    plt.close(fig)


if __name__ == "__main__":
    for k, v in rhythms().items():
        draw(k, v, noise=(k != "asystole"))
    print(sorted(os.listdir(OUT)))
