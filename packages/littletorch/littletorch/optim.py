"""Optimizers (PyTorch's `torch.optim`): turn gradients into weight updates."""

from __future__ import annotations

from typing import Iterable

import numpy as np

from .tensor import Tensor


class Optimizer:
    def __init__(self, params: Iterable[Tensor], lr: float):
        self.params = [p for p in params]
        if not self.params:
            raise ValueError("optimizer got an empty parameter list")
        self.lr = lr

    def zero_grad(self) -> None:
        """Forget the last step's gradients. Call before each backward()."""
        for p in self.params:
            p.grad = None

    def step(self) -> None:
        raise NotImplementedError


class SGD(Optimizer):
    """Stochastic gradient descent: w ← w − lr · grad, optionally with momentum
    (a running average of past gradients) and weight decay (L2)."""

    def __init__(self, params, lr: float = 0.01, momentum: float = 0.0, weight_decay: float = 0.0):
        super().__init__(params, lr)
        self.momentum, self.weight_decay = momentum, weight_decay
        self._velocity = [np.zeros_like(p.data) for p in self.params]

    def step(self) -> None:
        for p, v in zip(self.params, self._velocity):
            if p.grad is None:
                continue
            g = p.grad.data + self.weight_decay * p.data
            if self.momentum:
                v *= self.momentum
                v += g
                g = v
            p.data = p.data - self.lr * g


class Adam(Optimizer):
    """Adam: per-weight step sizes from running averages of the gradient and
    of its square, with bias correction for the first steps."""

    def __init__(self, params, lr: float = 1e-3, betas=(0.9, 0.999), eps: float = 1e-8, weight_decay: float = 0.0):
        super().__init__(params, lr)
        self.b1, self.b2 = betas
        self.eps, self.weight_decay = eps, weight_decay
        self._m = [np.zeros_like(p.data) for p in self.params]
        self._v = [np.zeros_like(p.data) for p in self.params]
        self._t = 0

    def step(self) -> None:
        self._t += 1
        for p, m, v in zip(self.params, self._m, self._v):
            if p.grad is None:
                continue
            g = p.grad.data + self.weight_decay * p.data
            m *= self.b1
            m += (1 - self.b1) * g
            v *= self.b2
            v += (1 - self.b2) * g * g
            m_hat = m / (1 - self.b1 ** self._t)
            v_hat = v / (1 - self.b2 ** self._t)
            p.data = p.data - self.lr * m_hat / (np.sqrt(v_hat) + self.eps)
