"""Self-test: every gradient checked against a numerical estimate, plus small
training runs that must actually learn.

    python -m littletorch._selftest          # anywhere NumPy is installed
    import littletorch._selftest as t; t.run()   # inside a notebook

Exits non-zero (or raises, when called) on failure.
"""

from __future__ import annotations

import sys

import numpy as np

import littletorch as torch
import littletorch.nn as nn
import littletorch.nn.functional as F

F64 = np.float64
_results: list[tuple[str, bool, str]] = []


def _check(label: str, ok: bool, detail: str = "") -> None:
    _results.append((label, bool(ok), detail))


def _numeric_grad(f, x: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    g = np.zeros_like(x)
    it = np.nditer(x, flags=["multi_index"])
    for _ in it:
        i = it.multi_index
        old = x[i]
        x[i] = old + eps
        hi = f()
        x[i] = old - eps
        lo = f()
        x[i] = old
        g[i] = (hi - lo) / (2 * eps)
    return g


def gradcheck(label: str, build, *shapes, positive: bool = False, tol: float = 1e-5) -> None:
    """build(*tensors) -> scalar Tensor. Compares autograd against finite
    differences for every input."""
    rng = np.random.default_rng(0)
    arrays = [rng.standard_normal(s) for s in shapes]
    if positive:
        arrays = [np.abs(a) + 0.5 for a in arrays]
    tensors = [torch.tensor(a, requires_grad=True, dtype=F64) for a in arrays]
    build(*tensors).backward()
    worst = 0.0
    for t in tensors:
        def f():
            return float(build(*[torch.tensor(u.data, dtype=F64) for u in tensors]).data)
        num = _numeric_grad(f, t.data)
        ana = t.grad.data if t.grad is not None else np.zeros_like(num)
        worst = max(worst, float(np.max(np.abs(num - ana)) / (1e-8 + np.max(np.abs(num)) + np.max(np.abs(ana)))))
    _check(f"gradient: {label}", worst < tol, f"relative error {worst:.2e}")


def _f64(module: nn.Module) -> nn.Module:
    for p in module.parameters():
        p.data = p.data.astype(F64)
    return module


def run(verbose: bool = True) -> bool:
    _results.clear()

    # ── elementwise and broadcasting ────────────────────────────────────────
    gradcheck("add with broadcasting", lambda a, b: (a + b).sum(), (3, 4), (4,))
    gradcheck("sub", lambda a, b: (a - b * 2).sum(), (3, 4), (3, 1))
    gradcheck("mul", lambda a, b: (a * b).sum(), (2, 3), (2, 3))
    gradcheck("div", lambda a, b: (a / b).sum(), (2, 3), (2, 3), positive=True)
    gradcheck("pow", lambda a: (a ** 3).sum(), (4,))
    gradcheck("exp, log", lambda a: (a.exp() + a.log()).sum(), (5,), positive=True)
    gradcheck("sigmoid, tanh", lambda a: (a.sigmoid() * a.tanh()).sum(), (6,))
    gradcheck("relu", lambda a: (a.relu() * a).sum(), (7,))
    gradcheck("abs, clamp", lambda a: (a.abs() + a.clamp(-0.5, 0.5)).sum(), (8,))

    # ── linear algebra, reductions, shapes ──────────────────────────────────
    gradcheck("matmul", lambda a, b: (a @ b).sum(), (3, 4), (4, 2))
    gradcheck("matmul vector", lambda a, b: (a @ b).sum(), (3, 4), (4,))
    gradcheck("batched matmul", lambda a, b: (a @ b).sum(), (2, 3, 4), (4, 5))
    gradcheck("sum over a dim", lambda a: (a.sum(dim=1) ** 2).sum(), (3, 4))
    gradcheck("mean keepdim", lambda a: (a - a.mean(dim=0, keepdim=True)).pow(2).sum() if hasattr(a, "pow") else ((a - a.mean(dim=0, keepdim=True)) ** 2).sum(), (4, 3))
    gradcheck("max over a dim", lambda a: a.max(dim=1).sum(), (3, 5))
    gradcheck("reshape, transpose", lambda a: (a.reshape(4, 3).T @ a.reshape(4, 3)).sum(), (3, 4))
    gradcheck("indexing", lambda a: (a[1:, ::2] ** 2).sum() + a[np.array([0, 0, 2])].sum(), (3, 4))
    gradcheck("stack, cat", lambda a, b: (torch.stack([a, b]).sum(0) * torch.cat([a, b], 1)[:, :4]).sum(), (2, 4), (2, 4))

    # ── softmax and losses ──────────────────────────────────────────────────
    gradcheck("log_softmax", lambda a: (F.log_softmax(a) * torch.tensor(np.arange(12.).reshape(3, 4), dtype=F64)).sum(), (3, 4))
    target = np.array([2, 0, 1])
    gradcheck("cross entropy", lambda a: F.cross_entropy(a, target), (3, 4))
    gradcheck("mse", lambda a, b: F.mse_loss(a, b), (5,), (5,))
    y01 = np.array([0.0, 1.0, 1.0, 0.0])
    gradcheck("BCE with logits", lambda a: F.binary_cross_entropy_with_logits(a, y01), (4,))

    # ── layers ──────────────────────────────────────────────────────────────
    torch.manual_seed(0)
    lin = _f64(nn.Linear(4, 3))
    gradcheck("Linear (input)", lambda x: lin(x).sum(), (2, 4))
    conv = _f64(nn.Conv2d(2, 3, kernel_size=3, stride=1, padding=1))
    gradcheck("Conv2d (input)", lambda x: (conv(x) ** 2).sum(), (2, 2, 5, 5), tol=1e-4)
    conv2 = _f64(nn.Conv2d(1, 2, kernel_size=2, stride=2))
    gradcheck("Conv2d stride 2 (input)", lambda x: conv2(x).sum(), (1, 1, 4, 4))

    # weights of a conv, against finite differences
    x = torch.tensor(np.random.default_rng(1).standard_normal((2, 2, 5, 5)), dtype=F64)
    conv.zero_grad()
    (conv(x) ** 2).sum().backward()
    w = conv.weight
    num = _numeric_grad(lambda: float((F.conv2d(x, torch.tensor(w.data, dtype=F64), torch.tensor(conv.bias.data, dtype=F64), 1, 1) ** 2).sum().data), w.data)
    err = np.max(np.abs(num - w.grad.data)) / (np.max(np.abs(num)) + 1e-8)
    _check("gradient: Conv2d (weights)", err < 1e-4, f"relative error {err:.2e}")

    gradcheck("MaxPool2d", lambda a: (F.max_pool2d(a, 2) * 3).sum(), (1, 2, 4, 4))

    # ── API behaviour ───────────────────────────────────────────────────────
    a = torch.tensor([1.0, 2.0], requires_grad=True)
    with torch.no_grad():
        b = a * 2
    _check("no_grad records nothing", not b.requires_grad)
    (a * a).sum().backward()
    (a * a).sum().backward()
    _check("gradients accumulate until zeroed", np.allclose(a.grad.data, [4.0, 8.0]))
    model = nn.Sequential(nn.Linear(2, 3), nn.ReLU(), nn.Linear(3, 1))
    _check("parameters are found through Sequential", len(list(model.parameters())) == 4)
    _check("parameter count", model.num_parameters() == 2 * 3 + 3 + 3 + 1)
    drop = nn.Dropout(0.5).eval()
    _check("dropout is off in eval mode", np.allclose(drop(torch.ones(10)).data, 1.0))

    # ── it learns ───────────────────────────────────────────────────────────
    torch.manual_seed(0)
    X = torch.tensor([[0, 0], [0, 1], [1, 0], [1, 1]], dtype=np.float32)
    y = torch.tensor([0, 1, 1, 0])
    net = nn.Sequential(nn.Linear(2, 8), nn.Tanh(), nn.Linear(8, 2))
    opt = torch.optim.Adam(net.parameters(), lr=0.05)
    loss_fn = nn.CrossEntropyLoss()
    for _ in range(300):
        opt.zero_grad()
        loss = loss_fn(net(X), y)
        loss.backward()
        opt.step()
    acc = float((net(X).argmax(1) == y).data.mean())
    _check("an MLP learns XOR", acc == 1.0, f"accuracy {acc:.2f}, loss {loss.item():.3f}")

    torch.manual_seed(0)
    rng = np.random.default_rng(0)
    # Tiny images: class 1 has a bright vertical bar, class 0 a horizontal one.
    imgs = rng.normal(0, 0.1, (64, 1, 8, 8)).astype(np.float32)
    labels = rng.integers(0, 2, 64)
    for i, c in enumerate(labels):
        if c:
            imgs[i, 0, :, 3] += 1
        else:
            imgs[i, 0, 3, :] += 1
    cnn = nn.Sequential(nn.Conv2d(1, 4, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2), nn.Flatten(), nn.Linear(4 * 4 * 4, 2))
    opt = torch.optim.SGD(cnn.parameters(), lr=0.1, momentum=0.9)
    loader = torch.data.DataLoader(torch.data.TensorDataset(imgs, labels), batch_size=16, shuffle=True)
    for _ in range(15):
        for xb, yb in loader:
            opt.zero_grad()
            loss_fn(cnn(xb), yb).backward()
            opt.step()
    with torch.no_grad():
        acc = float((cnn(torch.tensor(imgs)).argmax(1) == torch.tensor(labels)).data.mean())
    _check("a small CNN learns bars", acc >= 0.95, f"accuracy {acc:.2f}")

    passed = sum(ok for _, ok, _ in _results)
    if verbose:
        for label, ok, detail in _results:
            print(f"{'ok  ' if ok else 'FAIL'}  {label}" + (f"  ({detail})" if detail else ""))
        print(f"\n{passed}/{len(_results)} passed")
    return passed == len(_results)


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
