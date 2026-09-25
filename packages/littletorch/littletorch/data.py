"""Batching data for training (PyTorch's `torch.utils.data`, simplified)."""

from __future__ import annotations

import numpy as np

from .tensor import Tensor, rng


class TensorDataset:
    """Rows of several arrays, kept together: dataset[i] → (x[i], y[i], …)."""

    def __init__(self, *arrays):
        self.arrays = [a.data if isinstance(a, Tensor) else np.asarray(a) for a in arrays]
        n = {len(a) for a in self.arrays}
        if len(n) != 1:
            raise ValueError("all arrays in a TensorDataset need the same number of rows")

    def __len__(self) -> int:
        return len(self.arrays[0])

    def __getitem__(self, index):
        return tuple(Tensor(a[index]) for a in self.arrays)


class DataLoader:
    """Iterate a dataset in batches, optionally shuffled each epoch."""

    def __init__(self, dataset: TensorDataset, batch_size: int = 32, shuffle: bool = False, drop_last: bool = False):
        self.dataset, self.batch_size = dataset, batch_size
        self.shuffle, self.drop_last = shuffle, drop_last

    def __len__(self) -> int:
        n = len(self.dataset)
        return n // self.batch_size if self.drop_last else -(-n // self.batch_size)

    def __iter__(self):
        n = len(self.dataset)
        order = rng().permutation(n) if self.shuffle else np.arange(n)
        for start in range(0, n, self.batch_size):
            idx = order[start:start + self.batch_size]
            if self.drop_last and len(idx) < self.batch_size:
                break
            yield self.dataset[idx]
