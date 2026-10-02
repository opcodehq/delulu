import type { Block } from "../spec";
import { agent } from "./agent";
import { bars } from "./bars";
import { chart } from "./chart";
import { checklist } from "./checklist";
import { cut } from "./cut";
import { headline } from "./headline";
import { launches } from "./launches";
import { leaderboard } from "./leaderboard";
import { picker } from "./picker";
import { poll } from "./poll";
import { post } from "./post";
import { quote } from "./quote";
import { rows } from "./rows";
import { stat } from "./stat";
import { terminal } from "./terminal";
import { chip, tile } from "./tile";
import type { BlockContext, RenderedBlock } from "./types";
import { versus } from "./versus";
import { wordmark } from "./wordmark";

export type { BlockContext, Cue, CueKind, RenderedBlock } from "./types";
export { CUE_KINDS } from "./types";

/** Render any block. The switch is exhaustive, so a new block type must be wired here. */
export const renderBlock = (block: Block, ctx: BlockContext): RenderedBlock => {
  switch (block.type) {
    case "headline":
      return headline(block, ctx);
    case "post":
      return post(block, ctx);
    case "stat":
      return stat(block, ctx);
    case "bars":
      return bars(block, ctx);
    case "checklist":
      return checklist(block, ctx);
    case "chart":
      return chart(block, ctx);
    case "versus":
      return versus(block, ctx);
    case "rows":
      return rows(block, ctx);
    case "quote":
      return quote(block, ctx);
    case "poll":
      return poll(block, ctx);
    case "tile":
      return tile(block, ctx);
    case "chip":
      return chip(block, ctx);
    case "cut":
      return cut(block, ctx);
    case "leaderboard":
      return leaderboard(block, ctx);
    case "picker":
      return picker(block, ctx);
    case "terminal":
      return terminal(block, ctx);
    case "launches":
      return launches(block, ctx);
    case "agent":
      return agent(block, ctx);
    case "wordmark":
      return wordmark(block, ctx);
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
};
