// A Markov chain of words, counted from a small training text: about 20,000
// words of Twilight fan fiction, split on spaces with punctuation left on.
//
// Two chains, one per size of the current state. Each step lists the most
// frequent next words after that state (at most five) with the number of
// times each followed it in the training text; the page shows each one's
// share of those counts. `pick` is the word the walk takes, so the walk is
// the same every time the page is used.
//
// Only the states on these two walks are included. The whole table is a few
// thousand states and is not needed to show the mechanism; the example
// passages below were generated from it offline.

export interface NextWord {
  word: string;
  count: number;
}

export interface MarkovStep {
  options: NextWord[];
  /** Index into options: the word this walk draws. */
  pick: number;
}

export interface MarkovChain {
  /** How many words the current state holds. */
  order: 1 | 2;
  /** The words the walk starts from. */
  start: string[];
  steps: MarkovStep[];
  /** Longer passages this chain produced, for the example-text box. */
  samples: string[];
}

export const CHAINS: Record<1 | 2, MarkovChain> = {
  1: {
    order: 1,
    start: ["The"],
    steps: [
      {
        options: [
          { word: "one", count: 3 },
          { word: "books", count: 3 },
          { word: "only", count: 2 },
          { word: "world", count: 1 },
          { word: "greatest", count: 1 },
        ],
        pick: 1,
      },
      {
        options: [
          { word: "were", count: 2 },
          { word: "weren't", count: 1 },
          { word: "she", count: 1 },
          { word: "description", count: 1 },
          { word: "I", count: 1 },
        ],
        pick: 4,
      },
      {
        options: [
          { word: "was", count: 29 },
          { word: "can't", count: 25 },
          { word: "thought", count: 24 },
          { word: "don't", count: 24 },
          { word: "love", count: 7 },
        ],
        pick: 4,
      },
      {
        options: [
          { word: "with", count: 5 },
          { word: "you", count: 4 },
          { word: "would", count: 1 },
          { word: "to", count: 1 },
          { word: "this", count: 1 },
        ],
        pick: 0,
      },
      {
        options: [
          { word: "a", count: 38 },
          { word: "her", count: 14 },
          { word: "the", count: 10 },
          { word: "his", count: 8 },
          { word: "Jasper", count: 1 },
        ],
        pick: 4,
      },
    ],
    samples: [
      "Mondays. Oh God, Edward's caramel eyes, Come with glee as you, Bella. Ignoring the hope's of silence, before me, Ready for the Cullen himself. I passed around my fictional love. I don't move.",
      "James, who were in my shoulders slumped and livid. Shirtless Edward? Had I run in horror I just going to get dressed in the keys. You're right. Well with me as Rose tell her slowly, wondering if he would of Edward's lips touched mine and look",
      "Rose likes? She nods with a step away and it had to the man I just where to me but let me unlike Edward. I thought in a movie when I really starting to the ground. Where's Jasper? I sighed, Sweetie, I'm sorry Mom.",
    ],
  },
  2: {
    order: 2,
    start: ["The", "books"],
    steps: [
      {
        options: [
          { word: "were", count: 1 },
          { word: "weren't", count: 1 },
          { word: "description", count: 1 },
        ],
        pick: 2,
      },
      { options: [{ word: "was", count: 1 }], pick: 0 },
      { options: [{ word: "a", count: 1 }], pick: 0 },
      {
        options: [
          { word: "vampire", count: 2 },
          { word: "threat", count: 1 },
          { word: "twig", count: 1 },
          { word: "lot", count: 1 },
          { word: "pretty", count: 1 },
        ],
        pick: 4,
      },
      {
        options: [
          { word: "name.", count: 1 },
          { word: "dress", count: 1 },
        ],
        pick: 0,
      },
    ],
    samples: [
      "You know what? Just leave him alone guys. Let him realize for himself how stupid he's being. I just couldn't resist. What did he think he would. I trip over my shoulder like Bella does in Twilight. Well not anymore apparently.",
      "I get out of my hand. I blushed at having Edward as my eyes flew open in shock, Why would she be jealous? I shrug, Because she thinks I'm a vegetarian.",
      "Does he know how Alice gets sometimes. I nod, Yeah, I know that you moved into the person who interrupted and gasp. Edward? He isn't looking at me with…Oh my gosh. He has Bella. She's his mate remember Alice. Not me.",
      "Jasper! I loved that shirt Alice glared at me in laughter. Alright, alright. Go change your shirt Jasper so we can apply tomorrow while you're in class. I look up at his lips. And she thought his family had ridiculous drivers.",
    ],
  },
};
