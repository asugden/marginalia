// The shapes of real language models: how many transformer blocks in series,
// how many attention heads in parallel inside each, the width of a word's
// vector, and the parameter count.
//
// The sources matter and are tagged. Open weights publish a config file with
// the exact shape (checked against each model's config.json on Hugging
// Face); papers state it in a table. The largest closed models publish
// nothing about their shape. The rows for those carry only a parameter count,
// tagged by who said it: the company's own chief executive, a press report,
// or an outside estimate.

export interface ModelShape {
  name: string;
  year: number | null;
  /** Release month, "YYYY-MM", for ordering the table. */
  released: string;
  /** Transformer blocks, run one after another. */
  blocks: number;
  /** Attention heads per block, run side by side. For grouped-query models
   *  this is the number of query heads, which is what fills the n × n grids. */
  heads: number;
  /** d_model: the length of each word's vector. */
  width: number;
  /** Total parameters, and for a mixture of experts the share used per word. */
  params: string;
  active?: string;
  source: "this site" | "paper" | "open weights";
  /** Where the parameters are (see Split). */
  split: Split;
}

/** A model's parameters by part, exact counts.
 *
 *  For open weights these were summed from the tensor shapes in each model's
 *  published safetensors headers on Hugging Face, sorted by tensor name:
 *  word tables (embedding in, and the output layer when it is a separate
 *  copy), attention (everything under the attention module, including
 *  compressors and indexers), fully connected (dense layers, shared and
 *  routed experts, and the router), and other (normalisation, extra
 *  next-token prediction layers, an image encoder). Packed 4-bit tensors are
 *  counted as two parameters per byte, and quantization scales are left out:
 *  they are bookkeeping for the rounding, not learned numbers. GPT-2 XL,
 *  GPT-3 and Llama 3.1 are from their published shapes (GPT-3 from the
 *  paper, biases left out); this site's block from its own files. */
export interface Split {
  /** Words in the vocabulary. */
  vocab: number;
  /** 1 when the output layer reuses the input table, 2 when it is a copy. */
  tables: 1 | 2;
  table: number;
  attention: number;
  connected: number;
  /** For a mixture of experts: the fully connected parameters one word
   *  passes through (shared experts plus its share of the routed ones). */
  connectedPerWord?: number;
  experts?: { perBlock: number; perWord: number };
  other: number;
}

export interface ReportedModel {
  name: string;
  year: number;
  /** Release month, "YYYY-MM", for ordering the table. */
  released: string;
  /** Only GPT-4's block count has ever been reported. */
  blocks?: string;
  /** Heads in all: this page's own guess, from open models of a similar
   *  size (see the table's note). Never reported by anyone. */
  headsGuess: string;
  params: string;
  source: "stated" | "press" | "estimate";
}

export const SOURCE_LABEL: Record<ModelShape["source"] | ReportedModel["source"], string> = {
  "this site": "the transformers example",
  paper: "published paper",
  "open weights": "open weights",
  stated: "stated by its CEO",
  press: "press report",
  estimate: "press estimate",
};

export const MODELS: ModelShape[] = [
  { name: "This site's block", year: null, released: "0000", blocks: 1, heads: 3, width: 16, params: "3,024", source: "this site", split: { vocab: 27, tables: 1, table: 432, attention: 2_304, connected: 288, other: 0 } },
  { name: "GPT-2 XL", year: 2019, released: "2019-11", blocks: 48, heads: 25, width: 1600, params: "1.5B", source: "open weights", split: { vocab: 50_257, tables: 1, table: 80_411_200, attention: 491_520_000, connected: 983_040_000, other: 2_640_000 } },
  { name: "GPT-3", year: 2020, released: "2020-05", blocks: 96, heads: 96, width: 12288, params: "175B", source: "paper", split: { vocab: 50_257, tables: 1, table: 617_558_016, attention: 57_982_058_496, connected: 115_964_116_992, other: 25_165_824 } },
  { name: "Llama 3.1 405B", year: 2024, released: "2024-07", blocks: 126, heads: 128, width: 16384, params: "405B", source: "open weights", split: { vocab: 128_256, tables: 2, table: 4_202_692_608, attention: 71_873_593_344, connected: 329_772_957_696, other: 4_145_152 } },
  { name: "gpt-oss-120b", year: 2025, released: "2025-08", blocks: 36, heads: 64, width: 2880, params: "117B", active: "5.1B", source: "open weights", split: { vocab: 201_088, tables: 2, table: 1_158_266_880, attention: 955_805_184, connected: 114_714_874_368, connectedPerWord: 3_597_700_608, experts: { perBlock: 128, perWord: 4 }, other: 210_240 } },
  { name: "GLM-5", year: 2026, released: "2026-02", blocks: 78, heads: 64, width: 6144, params: "744B", active: "40B", source: "open weights", split: { vocab: 154_880, tables: 2, table: 1_903_165_440, attention: 13_777_134_848, connected: 738_107_345_920, connectedPerWord: 26_619_169_792, experts: { perBlock: 256, perWord: 8 }, other: 76_492_800 } },
  { name: "DeepSeek-V4-Pro", year: 2026, released: "2026-04", blocks: 61, heads: 128, width: 7168, params: "1.6T", active: "49B", source: "open weights", split: { vocab: 129_280, tables: 2, table: 1_853_358_080, attention: 19_465_103_232, connected: 1_551_596_116_224, connectedPerWord: 28_377_995_520, experts: { perBlock: 384, perWord: 6 }, other: 25_925_097_246 } },
  { name: "Kimi K3", year: 2026, released: "2026-06", blocks: 93, heads: 96, width: 7168, params: "2.8T", active: "104B", source: "open weights", split: { vocab: 163_840, tables: 2, table: 2_348_810_240, attention: 36_190_795_008, connected: 2_740_940_851_712, connectedPerWord: 66_820_393_472, experts: { perBlock: 896, perWord: 16 }, other: 451_380_224 } },
  { name: "Qwen3.8", year: 2026, released: "2026-08", blocks: 92, heads: 64, width: 8192, params: "2.4T", active: "95B", source: "open weights", split: { vocab: 248_320, tables: 2, table: 4_068_474_880, attention: 39_895_618_944, connected: 2_375_839_088_640, connectedPerWord: 51_322_257_408, experts: { perBlock: 512, perWord: 10 }, other: 26_379_543_040 } },
];

/** Closed models: shown in the table, not drawn. */
export const REPORTED: ReportedModel[] = [
  { name: "GPT-4", year: 2023, released: "2023-03", blocks: "~120", headsGuess: "~11,500", params: "~1.8T", source: "press" },
  { name: "Grok 4", year: 2025, released: "2025-07", headsGuess: "~9,000", params: "3T", source: "stated" },
  // Release month unknown here; sorted to the end of its year.
  { name: "Claude Mythos 5", year: 2026, released: "2026-99", headsGuess: "~15,000", params: "~8T", source: "estimate" },
];

export type TableRow = { kind: "open"; model: ModelShape } | { kind: "closed"; model: ReportedModel };

/** Every row of the table, oldest first. */
export const TABLE: TableRow[] = [
  ...MODELS.map((model): TableRow => ({ kind: "open", model })),
  ...REPORTED.map((model): TableRow => ({ kind: "closed", model })),
].sort((a, b) => a.model.released.localeCompare(b.model.released));
