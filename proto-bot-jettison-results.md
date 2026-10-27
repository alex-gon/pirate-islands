1000 games at each of 3, 4, 5 seats per row; random personalities per seat; same seeds for every row.

| Variant | Rounds avg | p50 / p99 / max | >100 | Crashes/round | Jettisons/game | onto own crash | 0 due | Bag-out | Max island avg | Greedy | Sneaky | Wild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rules.js as committed | 14.6 | 14 / 31 / 51 | 0 | 1.07 | 24.4 | 17% | 9.1% | 0% | 6.6 | 1.01 | 0.90 | 1.09 |
| Freeze (v0.2) | 10.5 | 10 / 18 / 22 | 0 | 1.05 | 0.0 | 0% | 0.0% | 0% | 4.3 | 1.00 | 0.96 | 1.04 |
| Placeholder | 12.8 | 12 / 28 / 44 | 0 | 1.06 | 19.9 | 25% | 6.3% | 0% | 7.0 | 0.95 | 0.96 | 1.09 |
| Spite | 14.6 | 14 / 32 / 52 | 0 | 1.07 | 24.5 | 17% | 9.1% | 0% | 6.6 | 0.98 | 0.95 | 1.07 |
| Spite, shy 1 | 14.9 | 14 / 33 / 53 | 0 | 1.06 | 25.2 | 17% | 9.3% | 0% | 6.8 | 0.92 | 0.97 | 1.10 |
| Stash | 13.2 | 12 / 28 / 36 | 0 | 1.07 | 19.0 | 79% | 0.2% | 8% | 17.2 | 0.92 | 1.02 | 1.06 |
| Stash+spite | 12.6 | 12 / 25 / 36 | 0 | 1.06 | 19.5 | 25% | 6.0% | 0% | 6.2 | 1.00 | 0.93 | 1.07 |
| Spite, shy 3 | 15.3 | 14 / 33 / 49 | 0 | 1.07 | 26.7 | 16% | 10.0% | 0% | 7.0 | 0.90 | 1.07 | 1.03 |
| Spite, shy 10 | 16.9 | 16 / 36 / 61 | 0 | 1.06 | 31.4 | 16% | 11.0% | 0% | 7.9 | 0.87 | 1.03 | 1.10 |

Greedy/Sneaky/Wild: share of wins against a fair share (1.00 = wins as often as its seats would by chance).
