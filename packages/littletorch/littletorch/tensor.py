"""Tensors with reverse-mode automatic differentiation, on top of NumPy.

This file is meant to be read. Every operation builds a node in a graph and
says, in a few lines, how to push a gradient back through itself. `backward()`
walks the graph in reverse topological order and adds each node's gradient
into its inputs. That is the whole idea behind training a neural network.

The names follow PyTorch on purpose, so what students learn here carries over:
`tensor`, `requires_grad`, `.backward()`, `.grad`, `no_grad()`.
"""

from __future__ import annotations

import contextlib
from typing import Callable, Iterable, Sequence

import numpy as np

# ── global state ────────────────────────────────────────────────────────────

_grad_enabled = True
_rng = np.random.default_rng()


def manual_seed(seed: int) -> None:
    """Make random initialisation, `randn`, dropout and shuffling repeatable."""
    global _rng
    _rng = np.random.default_rng(seed)


def rng() -> np.random.Generator:
    return _rng


@contextlib.contextmanager
def no_grad():
    """Inside this block, operations are not recorded: use it for evaluation
    and for updating weights."""
    global _grad_enabled
    previous = _grad_enabled
    _grad_enabled = False
    try:
        yield
    finally:
        _grad_enabled = previous


def is_grad_enabled() -> bool:
    return _grad_enabled


# ── helpers ─────────────────────────────────────────────────────────────────

DEFAULT_FLOAT = np.float32


def _as_array(data, dtype=None) -> np.ndarray:
    """NumPy arrays keep their dtype (so float64 work stays float64). Python
    numbers and lists become float32, or int64 for whole numbers — the same
    defaults as PyTorch."""
    if isinstance(data, Tensor):
        data = data.data
    if dtype is not None:
        return np.asarray(data).astype(dtype, copy=False)
    if isinstance(data, (np.ndarray, np.generic)):
        return np.asarray(data)
    arr = np.asarray(data)
    if arr.dtype.kind == "f":
        return arr.astype(DEFAULT_FLOAT, copy=False)
    if arr.dtype.kind in "iub":
        return arr.astype(np.int64, copy=False) if arr.dtype.kind != "b" else arr
    return arr


def _unbroadcast(grad: np.ndarray, shape: tuple) -> np.ndarray:
    """Undo NumPy broadcasting: sum the gradient over the axes that were
    stretched, so it has the shape of the input it belongs to."""
    while grad.ndim > len(shape):
        grad = grad.sum(axis=0)
    for axis, size in enumerate(shape):
        if size == 1 and grad.shape[axis] != 1:
            grad = grad.sum(axis=axis, keepdims=True)
    return grad


def _wrap(other) -> "Tensor":
    return other if isinstance(other, Tensor) else Tensor(other)


# ── the tensor ──────────────────────────────────────────────────────────────


class Tensor:
    """An n-dimensional array that can remember how it was computed."""

    __array_priority__ = 1000  # so `numpy_array * tensor` uses Tensor's ops

    def __init__(self, data, requires_grad: bool = False, dtype=None,
                 _parents: Sequence["Tensor"] = (), _backward: Callable[[np.ndarray], None] | None = None,
                 _op: str = ""):
        self.data: np.ndarray = _as_array(data, dtype)
        self.requires_grad = bool(requires_grad)
        self.grad: Tensor | None = None
        self._parents = tuple(_parents)
        self._backward = _backward
        self._op = _op

    # ── building graph nodes ────────────────────────────────────────────────

    @staticmethod
    def _make(data: np.ndarray, parents: Sequence["Tensor"], backward, op: str) -> "Tensor":
        track = _grad_enabled and any(p.requires_grad for p in parents)
        if not track:
            return Tensor(data)
        return Tensor(data, requires_grad=True, _parents=parents, _backward=backward, _op=op)

    def _accumulate(self, g: np.ndarray) -> None:
        if not self.requires_grad:
            return
        g = g.astype(self.data.dtype, copy=False) if self.data.dtype.kind == "f" else g
        if self.grad is None:
            self.grad = Tensor(np.array(g, copy=True))
        else:
            self.grad.data = self.grad.data + g

    # ── autograd ────────────────────────────────────────────────────────────

    def backward(self, gradient=None) -> None:
        """Compute d(self)/d(x) for every tensor x with requires_grad that this
        tensor was computed from, and add it into x.grad."""
        if not self.requires_grad:
            raise RuntimeError("backward() on a tensor that doesn't require grad")
        if gradient is None:
            if self.data.size != 1:
                raise RuntimeError("backward() needs a gradient unless the tensor is a single number (e.g. a loss)")
            gradient = np.ones_like(self.data)
        order: list[Tensor] = []
        seen: set[int] = set()

        def visit(t: Tensor) -> None:
            stack = [(t, False)]
            while stack:
                node, done = stack.pop()
                if done:
                    order.append(node)
                    continue
                if id(node) in seen:
                    continue
                seen.add(id(node))
                stack.append((node, True))
                for p in node._parents:
                    if id(p) not in seen:
                        stack.append((p, False))

        visit(self)
        grads: dict[int, np.ndarray] = {id(self): _as_array(gradient, self.data.dtype)}
        for node in reversed(order):
            g = grads.pop(id(node), None)
            if g is None:
                continue
            if node._backward is None:  # a leaf: keep its gradient
                node._accumulate(g)
                continue
            for parent, pg in node._backward(g):
                if pg is None or not parent.requires_grad:
                    continue
                if id(parent) in grads:
                    grads[id(parent)] = grads[id(parent)] + pg
                else:
                    grads[id(parent)] = pg

    def zero_(self) -> "Tensor":
        self.data[...] = 0
        return self

    def detach(self) -> "Tensor":
        return Tensor(self.data)

    def requires_grad_(self, flag: bool = True) -> "Tensor":
        self.requires_grad = flag
        return self

    # ── arithmetic ──────────────────────────────────────────────────────────

    def __add__(self, other):
        other = _wrap(other)
        a, b = self, other
        return Tensor._make(a.data + b.data, (a, b),
                            lambda g: [(a, _unbroadcast(g, a.shape)), (b, _unbroadcast(g, b.shape))], "add")

    __radd__ = __add__

    def __neg__(self):
        a = self
        return Tensor._make(-a.data, (a,), lambda g: [(a, -g)], "neg")

    def __sub__(self, other):
        return self + (-_wrap(other))

    def __rsub__(self, other):
        return _wrap(other) + (-self)

    def __mul__(self, other):
        other = _wrap(other)
        a, b = self, other
        return Tensor._make(a.data * b.data, (a, b),
                            lambda g: [(a, _unbroadcast(g * b.data, a.shape)),
                                       (b, _unbroadcast(g * a.data, b.shape))], "mul")

    __rmul__ = __mul__

    def __truediv__(self, other):
        other = _wrap(other)
        a, b = self, other
        return Tensor._make(a.data / b.data, (a, b),
                            lambda g: [(a, _unbroadcast(g / b.data, a.shape)),
                                       (b, _unbroadcast(-g * a.data / (b.data ** 2), b.shape))], "div")

    def __rtruediv__(self, other):
        return _wrap(other) / self

    def __pow__(self, exponent):
        if isinstance(exponent, Tensor):
            raise TypeError("only a plain number is supported as an exponent")
        a = self
        return Tensor._make(a.data ** exponent, (a,),
                            lambda g: [(a, g * exponent * a.data ** (exponent - 1))], "pow")

    def __matmul__(self, other):
        other = _wrap(other)
        a, b = self, other

        def back(g):
            ga = g @ np.swapaxes(b.data, -1, -2) if b.data.ndim > 1 else np.multiply.outer(g, b.data)
            gb = np.swapaxes(a.data, -1, -2) @ g if a.data.ndim > 1 else np.multiply.outer(a.data, g)
            return [(a, _unbroadcast(ga, a.shape)), (b, _unbroadcast(gb, b.shape))]

        return Tensor._make(a.data @ b.data, (a, b), back, "matmul")

    def __rmatmul__(self, other):
        return _wrap(other) @ self

    # comparisons give plain (untracked) boolean tensors
    def __eq__(self, other):  # type: ignore[override]
        return Tensor(self.data == _as_array(other))

    def __ne__(self, other):  # type: ignore[override]
        return Tensor(self.data != _as_array(other))

    def __lt__(self, other):
        return Tensor(self.data < _as_array(other))

    def __le__(self, other):
        return Tensor(self.data <= _as_array(other))

    def __gt__(self, other):
        return Tensor(self.data > _as_array(other))

    def __ge__(self, other):
        return Tensor(self.data >= _as_array(other))

    __hash__ = object.__hash__

    # ── elementwise functions ───────────────────────────────────────────────

    def exp(self):
        a = self
        out = np.exp(a.data)
        return Tensor._make(out, (a,), lambda g: [(a, g * out)], "exp")

    def log(self):
        a = self
        return Tensor._make(np.log(a.data), (a,), lambda g: [(a, g / a.data)], "log")

    def sqrt(self):
        return self ** 0.5

    def abs(self):
        a = self
        return Tensor._make(np.abs(a.data), (a,), lambda g: [(a, g * np.sign(a.data))], "abs")

    def relu(self):
        a = self
        return Tensor._make(np.maximum(a.data, 0), (a,), lambda g: [(a, g * (a.data > 0))], "relu")

    def sigmoid(self):
        a = self
        out = 1.0 / (1.0 + np.exp(-a.data))
        return Tensor._make(out, (a,), lambda g: [(a, g * out * (1 - out))], "sigmoid")

    def tanh(self):
        a = self
        out = np.tanh(a.data)
        return Tensor._make(out, (a,), lambda g: [(a, g * (1 - out ** 2))], "tanh")

    def clamp(self, min=None, max=None):
        a = self
        out = np.clip(a.data, min, max)
        inside = np.ones_like(a.data, dtype=bool)
        if min is not None:
            inside &= a.data >= min
        if max is not None:
            inside &= a.data <= max
        return Tensor._make(out, (a,), lambda g: [(a, g * inside)], "clamp")

    # ── reductions ──────────────────────────────────────────────────────────

    def sum(self, dim=None, keepdim: bool = False):
        a = self
        out = a.data.sum(axis=dim, keepdims=keepdim)

        def back(g):
            if dim is not None and not keepdim:
                g = np.expand_dims(g, dim)
            return [(a, np.broadcast_to(g, a.shape).copy())]

        return Tensor._make(out, (a,), back, "sum")

    def mean(self, dim=None, keepdim: bool = False):
        n = self.data.size if dim is None else np.prod([self.shape[d] for d in np.atleast_1d(dim)])
        return self.sum(dim, keepdim) / float(n)

    def max(self, dim=None, keepdim: bool = False):
        a = self
        out = a.data.max(axis=dim, keepdims=True)
        mask = a.data == out
        mask = mask / mask.sum(axis=dim, keepdims=True)  # split ties evenly
        if keepdim:
            result = out
        elif dim is None:
            result = out.reshape(())
        else:
            result = np.squeeze(out, axis=dim)

        def back(g):
            if dim is None:
                g = np.reshape(g, (1,) * a.data.ndim)
            elif not keepdim:
                g = np.expand_dims(g, dim)
            return [(a, g * mask)]

        return Tensor._make(result, (a,), back, "max")

    def argmax(self, dim=None) -> "Tensor":
        return Tensor(self.data.argmax(axis=dim))

    # ── shape ───────────────────────────────────────────────────────────────

    def reshape(self, *shape):
        if len(shape) == 1 and isinstance(shape[0], (tuple, list)):
            shape = tuple(shape[0])
        a = self
        return Tensor._make(a.data.reshape(shape), (a,), lambda g: [(a, g.reshape(a.shape))], "reshape")

    view = reshape

    def flatten(self, start_dim: int = 0):
        return self.reshape(self.shape[:start_dim] + (-1,))

    def permute(self, *dims):
        if len(dims) == 1 and isinstance(dims[0], (tuple, list)):
            dims = tuple(dims[0])
        a = self
        inverse = np.argsort(dims)
        return Tensor._make(a.data.transpose(dims), (a,), lambda g: [(a, g.transpose(inverse))], "permute")

    def transpose(self, d0: int = -2, d1: int = -1):
        dims = list(range(self.ndim))
        dims[d0], dims[d1] = dims[d1], dims[d0]
        return self.permute(dims)

    @property
    def T(self):
        return self.permute(tuple(reversed(range(self.ndim))))

    def __getitem__(self, index):
        if isinstance(index, Tensor):
            index = index.data
        if isinstance(index, tuple):
            index = tuple(i.data if isinstance(i, Tensor) else i for i in index)
        a = self

        def back(g):
            full = np.zeros_like(a.data, dtype=g.dtype)
            np.add.at(full, index, g)
            return [(a, full)]

        return Tensor._make(a.data[index], (a,), back, "index")

    # ── conversions and inspection ─────────────────────────────────────────

    @property
    def shape(self) -> tuple:
        return self.data.shape

    @property
    def ndim(self) -> int:
        return self.data.ndim

    @property
    def dtype(self):
        return self.data.dtype

    def size(self, dim=None):
        return self.shape if dim is None else self.shape[dim]

    def numel(self) -> int:
        return int(self.data.size)

    def dim(self) -> int:
        return self.ndim

    def item(self):
        return self.data.item()

    def numpy(self) -> np.ndarray:
        return self.data

    def tolist(self):
        return self.data.tolist()

    def float(self) -> "Tensor":
        return Tensor(self.data.astype(DEFAULT_FLOAT))

    def long(self) -> "Tensor":
        return Tensor(self.data.astype(np.int64))

    def __len__(self) -> int:
        return len(self.data)

    def __iter__(self):
        for i in range(len(self)):
            yield self[i]

    def __array__(self, dtype=None, copy=None):
        return self.data if dtype is None else self.data.astype(dtype)

    def __float__(self):
        return float(self.data)

    def __repr__(self) -> str:
        body = np.array2string(self.data, precision=4, separator=", ", prefix="tensor(")
        extra = ", requires_grad=True" if self.requires_grad else ""
        return f"tensor({body}{extra})"


# ── constructors (PyTorch names) ────────────────────────────────────────────


def tensor(data, requires_grad: bool = False, dtype=None) -> Tensor:
    return Tensor(data, requires_grad=requires_grad, dtype=dtype)


def from_numpy(array: np.ndarray) -> Tensor:
    return Tensor(array)


def zeros(*shape, requires_grad: bool = False) -> Tensor:
    return Tensor(np.zeros(_shape(shape), dtype=DEFAULT_FLOAT), requires_grad=requires_grad)


def ones(*shape, requires_grad: bool = False) -> Tensor:
    return Tensor(np.ones(_shape(shape), dtype=DEFAULT_FLOAT), requires_grad=requires_grad)


def randn(*shape, requires_grad: bool = False) -> Tensor:
    return Tensor(_rng.standard_normal(_shape(shape)).astype(DEFAULT_FLOAT), requires_grad=requires_grad)


def rand(*shape, requires_grad: bool = False) -> Tensor:
    return Tensor(_rng.random(_shape(shape)).astype(DEFAULT_FLOAT), requires_grad=requires_grad)


def arange(*args) -> Tensor:
    return Tensor(np.arange(*args))


def _shape(shape) -> tuple:
    if len(shape) == 1 and isinstance(shape[0], (tuple, list)):
        return tuple(shape[0])
    return tuple(shape)


def stack(tensors: Iterable[Tensor], dim: int = 0) -> Tensor:
    ts = [_wrap(t) for t in tensors]

    def back(g):
        parts = np.split(g, len(ts), axis=dim)
        return [(t, np.squeeze(p, axis=dim)) for t, p in zip(ts, parts)]

    return Tensor._make(np.stack([t.data for t in ts], axis=dim), ts, back, "stack")


def cat(tensors: Iterable[Tensor], dim: int = 0) -> Tensor:
    ts = [_wrap(t) for t in tensors]
    edges = np.cumsum([t.shape[dim] for t in ts])[:-1]

    def back(g):
        return list(zip(ts, np.split(g, edges, axis=dim)))

    return Tensor._make(np.concatenate([t.data for t in ts], axis=dim), ts, back, "cat")
