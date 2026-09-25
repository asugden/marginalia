"""Layers and losses (PyTorch's `torch.nn`).

A Module holds Parameters and other Modules, and its `forward` describes how
input becomes output. Calling a module runs `forward`. `parameters()` finds
every Parameter inside it, which is what an optimizer updates.
"""

from __future__ import annotations

import math
from collections import OrderedDict
from typing import Iterator

import numpy as np

from ..tensor import Tensor, rng
from . import functional as F

__all__ = [
    "Parameter", "Module", "Sequential", "Linear", "Conv2d", "MaxPool2d", "Flatten",
    "ReLU", "Sigmoid", "Tanh", "Softmax", "Dropout",
    "MSELoss", "CrossEntropyLoss", "BCELoss", "BCEWithLogitsLoss", "functional",
]
functional = F


class Parameter(Tensor):
    """A tensor a Module learns. Always requires a gradient."""

    def __init__(self, data):
        super().__init__(data, requires_grad=True)

    def __repr__(self) -> str:
        return "Parameter containing:\n" + super().__repr__()


class Module:
    def __init__(self):
        object.__setattr__(self, "_parameters", OrderedDict())
        object.__setattr__(self, "_modules", OrderedDict())
        object.__setattr__(self, "training", True)

    def __setattr__(self, name, value):
        if "_parameters" not in self.__dict__:
            raise AttributeError("call super().__init__() first in your Module's __init__")
        if isinstance(value, Parameter):
            self._parameters[name] = value
        elif isinstance(value, Module):
            self._modules[name] = value
        object.__setattr__(self, name, value)

    def forward(self, *args, **kwargs):
        raise NotImplementedError(f"{type(self).__name__} needs a forward() method")

    def __call__(self, *args, **kwargs):
        return self.forward(*args, **kwargs)

    # ── parameters ──────────────────────────────────────────────────────────

    def named_parameters(self, prefix: str = "") -> Iterator[tuple[str, Parameter]]:
        for name, p in self._parameters.items():
            yield prefix + name, p
        for name, m in self._modules.items():
            yield from m.named_parameters(prefix + name + ".")

    def parameters(self) -> Iterator[Parameter]:
        for _, p in self.named_parameters():
            yield p

    def zero_grad(self) -> None:
        for p in self.parameters():
            p.grad = None

    def num_parameters(self) -> int:
        return sum(p.numel() for p in self.parameters())

    # ── modes ───────────────────────────────────────────────────────────────

    def train(self, mode: bool = True) -> "Module":
        object.__setattr__(self, "training", mode)
        for m in self._modules.values():
            m.train(mode)
        return self

    def eval(self) -> "Module":
        return self.train(False)

    # ── saving ──────────────────────────────────────────────────────────────

    def state_dict(self) -> dict[str, np.ndarray]:
        return {name: p.data.copy() for name, p in self.named_parameters()}

    def load_state_dict(self, state: dict) -> None:
        params = dict(self.named_parameters())
        for name, value in state.items():
            if name not in params:
                raise KeyError(f"unexpected parameter {name!r}")
            params[name].data = np.asarray(value, dtype=params[name].data.dtype).copy()

    # ── display ─────────────────────────────────────────────────────────────

    def extra_repr(self) -> str:
        return ""

    def __repr__(self) -> str:
        if not self._modules:
            return f"{type(self).__name__}({self.extra_repr()})"
        lines = [f"{type(self).__name__}("]
        for name, m in self._modules.items():
            child = repr(m).replace("\n", "\n  ")
            lines.append(f"  ({name}): {child}")
        lines.append(")")
        return "\n".join(lines)


class Sequential(Module):
    """Run modules one after another."""

    def __init__(self, *modules: Module):
        super().__init__()
        for i, m in enumerate(modules):
            setattr(self, str(i), m)

    def forward(self, x):
        for m in self._modules.values():
            x = m(x)
        return x

    def __getitem__(self, i: int) -> Module:
        return list(self._modules.values())[i]

    def __len__(self) -> int:
        return len(self._modules)


def _uniform(shape, bound: float) -> Parameter:
    return Parameter(rng().uniform(-bound, bound, size=shape).astype(np.float32))


class Linear(Module):
    """y = x Wᵀ + b. Initialised like PyTorch: uniform in ±1/sqrt(in_features)."""

    def __init__(self, in_features: int, out_features: int, bias: bool = True):
        super().__init__()
        self.in_features, self.out_features = in_features, out_features
        bound = 1.0 / math.sqrt(in_features)
        self.weight = _uniform((out_features, in_features), bound)
        self.bias = _uniform((out_features,), bound) if bias else None

    def forward(self, x):
        return F.linear(x, self.weight, self.bias)

    def extra_repr(self) -> str:
        return f"in_features={self.in_features}, out_features={self.out_features}, bias={self.bias is not None}"


class Conv2d(Module):
    """2-D convolution over (batch, channels, height, width) input."""

    def __init__(self, in_channels: int, out_channels: int, kernel_size, stride=1, padding=0, bias: bool = True):
        super().__init__()
        kh, kw = F._pair(kernel_size)
        self.in_channels, self.out_channels = in_channels, out_channels
        self.kernel_size, self.stride, self.padding = (kh, kw), stride, padding
        bound = 1.0 / math.sqrt(in_channels * kh * kw)
        self.weight = _uniform((out_channels, in_channels, kh, kw), bound)
        self.bias = _uniform((out_channels,), bound) if bias else None

    def forward(self, x):
        return F.conv2d(x, self.weight, self.bias, self.stride, self.padding)

    def extra_repr(self) -> str:
        return (f"{self.in_channels}, {self.out_channels}, kernel_size={self.kernel_size}, "
                f"stride={self.stride}, padding={self.padding}")


class MaxPool2d(Module):
    def __init__(self, kernel_size, stride=None):
        super().__init__()
        self.kernel_size, self.stride = kernel_size, stride

    def forward(self, x):
        return F.max_pool2d(x, self.kernel_size, self.stride)

    def extra_repr(self) -> str:
        return f"kernel_size={self.kernel_size}, stride={self.stride or self.kernel_size}"


class Flatten(Module):
    """(batch, …) → (batch, everything else)."""

    def forward(self, x):
        return x.flatten(1)


class ReLU(Module):
    def forward(self, x):
        return x.relu()


class Sigmoid(Module):
    def forward(self, x):
        return x.sigmoid()


class Tanh(Module):
    def forward(self, x):
        return x.tanh()


class Softmax(Module):
    def __init__(self, dim: int = -1):
        super().__init__()
        self.dim = dim

    def forward(self, x):
        return F.softmax(x, self.dim)


class Dropout(Module):
    def __init__(self, p: float = 0.5):
        super().__init__()
        self.p = p

    def forward(self, x):
        return F.dropout(x, self.p, self.training)

    def extra_repr(self) -> str:
        return f"p={self.p}"


class MSELoss(Module):
    def forward(self, prediction, target):
        return F.mse_loss(prediction, target)


class CrossEntropyLoss(Module):
    """Takes raw scores (logits), not probabilities — like PyTorch."""

    def forward(self, logits, target):
        return F.cross_entropy(logits, target)


class BCELoss(Module):
    def forward(self, probability, target):
        return F.binary_cross_entropy(probability, target)


class BCEWithLogitsLoss(Module):
    def forward(self, logits, target):
        return F.binary_cross_entropy_with_logits(logits, target)
