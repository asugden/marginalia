"""Functions used by layers and losses (PyTorch's `torch.nn.functional`).

Most are built from Tensor operations, so autograd handles them. A few are
written as a single operation with their own backward step because the
composed version would be slow or numerically unstable: softmax, the losses,
convolution and pooling. Each says why.
"""

from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from ..tensor import Tensor, _wrap, rng

# ── activations ─────────────────────────────────────────────────────────────


def relu(x: Tensor) -> Tensor:
    return x.relu()


def sigmoid(x: Tensor) -> Tensor:
    return x.sigmoid()


def tanh(x: Tensor) -> Tensor:
    return x.tanh()


def log_softmax(x: Tensor, dim: int = -1) -> Tensor:
    """log(softmax(x)), computed stably: subtract the max before exp, so large
    logits don't overflow."""
    shifted = x.data - x.data.max(axis=dim, keepdims=True)
    lse = np.log(np.exp(shifted).sum(axis=dim, keepdims=True))
    out = shifted - lse
    soft = np.exp(out)
    return Tensor._make(out, (x,), lambda g: [(x, g - soft * g.sum(axis=dim, keepdims=True))], "log_softmax")


def softmax(x: Tensor, dim: int = -1) -> Tensor:
    return log_softmax(x, dim).exp()


def dropout(x: Tensor, p: float = 0.5, training: bool = True) -> Tensor:
    """Zero each value with probability p during training, and scale the rest
    by 1/(1-p) so the expected output is unchanged."""
    if not training or p == 0:
        return x
    keep = (rng().random(x.shape) >= p).astype(x.data.dtype) / (1.0 - p)
    return x * Tensor(keep)


def linear(x: Tensor, weight: Tensor, bias: Tensor | None = None) -> Tensor:
    out = x @ weight.T
    return out + bias if bias is not None else out


# ── losses ──────────────────────────────────────────────────────────────────


def mse_loss(prediction: Tensor, target) -> Tensor:
    diff = prediction - _wrap(target)
    return (diff * diff).mean()


def cross_entropy(logits: Tensor, target) -> Tensor:
    """Mean negative log-likelihood of the correct class. `logits` is
    (batch, classes) of raw scores; `target` holds class indices (batch,)."""
    t = _wrap(target).data.astype(np.int64)
    logp = log_softmax(logits, dim=-1)
    picked = logp[np.arange(len(t)), t]
    return -picked.mean()


def binary_cross_entropy_with_logits(logits: Tensor, target) -> Tensor:
    """Binary cross-entropy on raw scores, in the stable form
    max(x, 0) - x*y + log(1 + exp(-|x|)), which never takes log of 0."""
    x = logits.data
    y = _wrap(target).data.astype(x.dtype)
    per = np.maximum(x, 0) - x * y + np.log1p(np.exp(-np.abs(x)))
    n = per.size

    def back(g):
        sig = 1.0 / (1.0 + np.exp(-x))
        return [(logits, g * (sig - y) / n)]

    return Tensor._make(np.asarray(per.mean(), dtype=x.dtype), (logits,), back, "bce_logits")


def binary_cross_entropy(probability: Tensor, target, eps: float = 1e-7) -> Tensor:
    p = probability.clamp(eps, 1 - eps)
    y = _wrap(target)
    return -(y * p.log() + (1 - y) * (1 - p).log()).mean()


# ── convolution and pooling ─────────────────────────────────────────────────
#
# Both use NumPy's sliding_window_view to see every kh×kw patch of the input
# at once, without copying. Convolution is then one einsum (a big matrix
# multiply); its backward pass spreads each output gradient back over the
# patch that produced it.


def _pair(v) -> tuple[int, int]:
    return (v, v) if isinstance(v, int) else tuple(v)  # type: ignore[return-value]


def conv2d(x: Tensor, weight: Tensor, bias: Tensor | None = None, stride=1, padding=0) -> Tensor:
    """x: (batch, in_channels, H, W); weight: (out_channels, in_channels, kh, kw)."""
    sh, sw = _pair(stride)
    ph, pw = _pair(padding)
    kh, kw = weight.shape[2], weight.shape[3]
    xp = np.pad(x.data, ((0, 0), (0, 0), (ph, ph), (pw, pw)))
    windows = sliding_window_view(xp, (kh, kw), axis=(2, 3))[:, :, ::sh, ::sw]  # (N, C, Ho, Wo, kh, kw)
    out = np.einsum("nchwij,ocij->nohw", windows, weight.data, optimize=True)
    ho, wo = out.shape[2], out.shape[3]
    parents = (x, weight) if bias is None else (x, weight, bias)
    if bias is not None:
        out = out + bias.data.reshape(1, -1, 1, 1)

    def back(g):
        grads = []
        # Input: each output position sends its gradient back through the
        # kernel to the patch it saw; overlapping patches add up. Skipped for
        # the image itself, which never needs a gradient.
        if x.requires_grad:
            dxp = np.zeros_like(xp)
            dpatch = np.einsum("nohw,ocij->nchwij", g, weight.data, optimize=True)
            for i in range(kh):
                for j in range(kw):
                    dxp[:, :, i:i + sh * ho:sh, j:j + sw * wo:sw] += dpatch[:, :, :, :, i, j]
            grads.append((x, dxp[:, :, ph:ph + x.shape[2], pw:pw + x.shape[3]]))
        grads.append((weight, np.einsum("nchwij,nohw->ocij", windows, g, optimize=True)))
        if bias is not None:
            grads.append((bias, g.sum(axis=(0, 2, 3))))
        return grads

    return Tensor._make(out.astype(x.data.dtype, copy=False), parents, back, "conv2d")


def max_pool2d(x: Tensor, kernel_size=2, stride=None) -> Tensor:
    """Keep the largest value in each window. The gradient goes only to the
    position that held it."""
    kh, kw = _pair(kernel_size)
    sh, sw = _pair(stride if stride is not None else kernel_size)
    windows = sliding_window_view(x.data, (kh, kw), axis=(2, 3))[:, :, ::sh, ::sw]
    n, c, ho, wo = windows.shape[:4]
    flat = windows.reshape(n, c, ho, wo, kh * kw)
    idx = flat.argmax(axis=-1)
    out = np.take_along_axis(flat, idx[..., None], axis=-1)[..., 0]

    def back(g):
        dx = np.zeros_like(x.data)
        di, dj = np.divmod(idx, kw)
        nn_, cc, hh, ww = np.indices(idx.shape)
        np.add.at(dx, (nn_, cc, hh * sh + di, ww * sw + dj), g)
        return [(x, dx)]

    return Tensor._make(out, (x,), back, "max_pool2d")
