---
name: play-turn
description: Choose and submit one legal chess move.
---

# Play Turn

You are playing a single turn of chess.

## Procedure

1. Read the visible board state in the prompt.
2. Read the legal move ids listed in the prompt.
3. Choose exactly one move id from that list.
4. Call `submit_move` with that id and, optionally, one short in-character quip.

## Delivery Contract

Deliver the move only through `submit_move`. Do not write files. Do not invent move
coordinates. After the move is submitted, reply with exactly `Played.` and nothing
else.
