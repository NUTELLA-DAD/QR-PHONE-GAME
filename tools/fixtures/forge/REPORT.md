# Ship forge report

Run: seed 1, 60 random ships + 10 shelf ships, 7 Swiss rounds, 4 generations of 20 children, a round robin of the best 12; 5 bot crew a side, weight cap 173, 7 environments (skyisles, storm, sea, frost, ember, fungal, aether). 1262 Versus games (one round each, both sides, the sky and the map seed changing), 0 with errors, 39.8 minutes on 6 workers.

Ratings are Bradley-Terry fits over every game (Elo scale, the classic ship = 1500, a pseudo-draw against an average ship keeps small samples near 1500). A game is one round of a Versus match; a draw counts half. Red/left side advantage in these games: 16 Elo points.

## Hall of Fame (generated and evolved ships)

| # | Ship | What she is | Elo | Win % (W-D-L) | Weight | Parts | Time in bands short/mid/long | Gen | Co-op |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Anvil Anvil of Dawn** | ram-prow bruiser with a long gun, a harpoon and a ram prow | 1546 | 63% (22-1-13) | 153 | 1 long, 1 harpoon, 1 ram, 2 sails, armour 4.8, 2 engines, 4 bags | 69% / 20% / 9% | gen 2 (Anvil Bullock II) | 0/3 won, 2.3/6 stops |
| 2 | **Broad Volley** | broadside gunboat with a long gun, armour plate and lift engines | 1533 | 66% (33-0-17) | 154 | 1 long, 6 plain guns, armour 2.4, 3 engines (1 up), 4 bags | 47% / 31% / 19% | gen 2 (Salvo Volley II) | 0/3 won, 2.7/8 stops |
| 3 | **Cannonade Thunder** | broadside gunboat with a long gun, armour plate and lift engines | 1500 | 52% (15-1-14) | 154 | 1 long, 6 plain guns, armour 2.4, 3 engines (1 up), 4 bags | 48% / 28% / 21% | gen 4 (Broad Volley) | 0/3 won, 2.3/6 stops |
| 4 | **Horned Bullock IV** | ram-prow bruiser with a long gun, a harpoon and a ram prow | 1471 | 47% (14-0-16) | 137 | 1 long, 1 harpoon, 1 ram, 1 crew cannon, 1 sails, armour 1.2, 3 engines, 2 bags | 67% / 22% / 8% | gen 4 (Midnight Corsair II x Anvil Anvil of Dawn) | 0/3 won, 1.3/8 stops |
| 5 | **Bastion Citadel** | floating fortress with a long gun, a mortar and a harpoon | 1446 | 50% (4-0-4) | 164 | 1 long, 1 mortar, 1 harpoon, 3 plain guns, armour 7.2, 3 engines, 4 bags | 32% / 49% / 16% | gen 4 (Great Keep IV) | 0/3 won, 0.7/8 stops |
| 6 | **Thundering Bullock** | ram-prow bruiser with grapeshot, harpoons and a ram prow | 1445 | 67% (12-0-6) | 123 | 1 grapeshot, 2 harpoon, 1 ram, 1 sails, armour 3.6, 2 engines, 1 bag | 72% / 18% / 8% | gen 2 (Stout Anvil) | 0/3 won, 3.0/8 stops |
| 7 | **Midnight Corsair II** | boarding raider with grapeshot, a flak gun and a crew cannon | 1445 | 67% (12-0-6) | 132 | 2 grapeshot, 1 flak, 1 crew cannon, armour 2.4, 3 engines, 2 bags | 55% / 34% / 10% | gen 2 (Bold Magpie) | 0/3 won, 2.7/6 stops |
| 8 | **Stout Anvil II** | ram-prow bruiser with grapeshot, harpoons and a flamethrower | 1435 | 64% (9-0-5) | 138 | 1 grapeshot, 2 harpoon, 1 flame, 1 ram, 1 sails, armour 4.8, 2 engines, 1 bag | 75% / 10% / 12% | gen 3 (Anvil Anvil of Dawn x Thundering Bullock) | 0/3 won, 2.7/6 stops |
| 9 | **Broad Thunder** | broadside gunboat with a mortar, a flak gun and armour plate | 1434 | 71% (10-0-4) | 144 | 1 mortar, 1 flak, 3 plain guns, armour 2.4, 3 engines (1 up), 4 bags | 47% / 20% / 30% | gen 3 (Great Keep II x Granite Bastion) | 0/3 won, 2.7/6 stops |
| 10 | **Granite Bastion** | floating fortress with a long gun, a mortar and a harpoon | 1425 | 63% (15-0-9) | 166 | 1 long, 1 mortar, 1 harpoon, 3 plain guns, armour 7.2, 3 engines, 4 bags | 40% / 39% / 18% | gen 2 (Mighty Bastion) | 0/3 won, 0.3/6 stops |

Co-op reference: the classic ship wins 1/3 voyages, 5.0/6 stops (voyage mode, 8 bots, Normal, 45 minute cap; the voyage starts on the ship and the sky-dock Yard builds on it).

### Weapon use of the champions (per game, averaged)

| Ship | shells | hits per shell | long gun hit % | mortar shells | mines laid / hit | rams | harpoons latched | boardings | damage dealt / taken |
|---|---|---|---|---|---|---|---|---|---|
| Anvil Anvil of Dawn | 26 | 2.93 | 99% | 0.0 | 0.0 / 0.00 | 4.53 | 0.75 | 0.42 | 30 / 19 |
| Broad Volley | 59 | 1.53 | 93% | 0.0 | 0.0 / 0.00 | 0.00 | 0.00 | 1.92 | 27 / 13 |
| Cannonade Thunder | 54 | 1.66 | 95% | 0.0 | 0.0 / 0.00 | 0.00 | 0.00 | 2.67 | 29 / 19 |
| Horned Bullock IV | 22 | 3.13 | 98% | 0.0 | 0.0 / 0.00 | 3.70 | 0.03 | 0.13 | 26 / 13 |
| Bastion Citadel | 33 | 1.56 | 100% | 12.3 | 0.0 / 0.00 | 0.00 | 0.13 | 0.00 | 20 / 14 |
| Thundering Bullock | 1 | 8.00 | - | 0.0 | 0.0 / 0.00 | 7.33 | 0.50 | 0.56 | 0 / 20 |
| Midnight Corsair II | 76 | 1.06 | - | 0.0 | 0.0 / 0.00 | 0.00 | 0.00 | 0.00 | 11 / 11 |
| Stout Anvil II | 1 | 6.86 | - | 0.0 | 0.0 / 0.00 | 4.50 | 0.00 | 0.29 | 1 / 17 |
| Broad Thunder | 42 | 1.09 | - | 10.2 | 0.0 / 0.00 | 0.00 | 0.00 | 2.29 | 11 / 11 |
| Granite Bastion | 60 | 1.24 | 100% | 17.8 | 0.0 / 0.00 | 0.00 | 0.13 | 0.00 | 24 / 17 |

## The shelf ships and the generated field

| Ship | Elo | Win % | Games | Parts |
|---|---|---|---|---|
| Ram | 1706 | 78% | 36 | 2 grapeshot, 1 harpoon, 4 plain guns, 1 ram, 1 bomb bay, 2 engines, 1 bag |
| Variant C | 1703 | 75% | 36 | 7 plain guns, 1 bomb bay, 2 engines, 1 bag |
| Sniper | 1604 | 67% | 36 | 2 long, 1 mortar, 1 mines, 4 plain guns, 1 bomb bay, 2 engines, 1 bag |
| Firebrand | 1587 | 67% | 36 | 1 harpoon, 2 flame, 3 plain guns, 1 bomb bay, armour 1.3, 2 engines, 1 bag |
| Classic | 1500 | 73% | 196 | 7 plain guns, 1 bomb bay, 2 engines, 1 bag |
| Brawler | 1356 | 64% | 14 | 2 grapeshot, 1 flak, 4 plain guns, 1 bomb bay, 2 engines, 1 bag |
| Variant B | 1349 | 64% | 14 | 7 plain guns, 1 bomb bay, 2 engines, 1 bag |
| Twin Boiler | 1333 | 64% | 14 | 7 plain guns, 1 bomb bay, 2 engines, 1 bag |
| Variant A | 1293 | 50% | 14 | 7 plain guns, 1 bomb bay, 2 engines, 1 bag |
| Four Bags | 1159 | 57% | 14 | 7 plain guns, 1 bomb bay, 2 engines, 4 bags |

Generation 0 (60 random ships): mean Elo 1015, best 1399, worst 494. Evolved ships (80): mean Elo 1268.

### By theme (generation 0)

| Theme | Ships | Mean Elo | Best |
|---|---|---|---|
| kiter (long-range kiter) | 6 | 888 | 1122 |
| brawler (close-quarters brawler) | 6 | 785 | 1204 |
| rammer (ram-prow bruiser) | 6 | 1045 | 1204 |
| firebrand (fireship) | 6 | 980 | 1171 |
| raider (boarding raider) | 6 | 1126 | 1189 |
| bomber (bomber) | 5 | 994 | 1087 |
| fortress (floating fortress) | 5 | 1183 | 1399 |
| skiff (speedy skiff) | 5 | 1004 | 1302 |
| gunboat (broadside gunboat) | 5 | 1104 | 1293 |
| sapper (mine-laying sapper) | 5 | 1063 | 1179 |
| wildcard (wild card) | 5 | 1045 | 1317 |

## Evolution

| Gen | Children | Mean Elo of children | Mean Elo of the parent pool | Best child |
|---|---|---|---|---|
| 1 | 20 | 1202 | 1237 | Grinning Jackdaw (1364; Steadfast Citadel x Sly Jackdaw: cross weapons) |
| 2 | 20 | 1309 | 1334 | Midnight Corsair II (1638; Bold Magpie: move extinguisher) |
| 3 | 20 | 1298 | 1395 | Stout Anvil II (1510; Anvil Anvil of Dawn x Thundering Bullock: cross weapons, aim engine, +gun_flame) |
| 4 | 20 | 1323 | 1444 | Horned Bullock IV (1593; Midnight Corsair II x Anvil Anvil of Dawn: cross sections) |

## Part statistics

Each part tag against the ship ratings of every generated / evolved ship with 4+ games. **corr** = correlation of "has it" with Elo (all games; the per-environment columns use that environment's own rating); **effect** = what the part is worth in Elo points by a logistic regression over every game (red-minus-blue tag difference, ridge-penalised, +- one standard error); **verdict** = DOMINANT (corr 0.25+, effect 40+ and significant, good in nearly every environment), TRAP (the mirror image), situational (the per-environment correlation is +0.2 or more in one sky and -0.2 or less in another; the sign flips), helps / hurts (a significant effect of 30+ Elo that is not clear enough everywhere for the big words; the regression holds the other parts fixed, so where it disagrees with the plain correlation the part is riding on what it is usually built with) or neutral. The environment columns are noisy (each ship plays about two games in each); read them as a trend.

| Part | Ships with it | corr | skyisles | storm | sea | frost | ember | fungal | aether | effect (Elo) | Mean Elo with / without | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| long gun | 65 | 0.12 | 0.11 | 0.20 | -0.00 | -0.07 | -0.09 | -0.00 | 0.02 | +23 +- 31 | 1187 / 1135 | neutral |
| 2+ long guns | 12 | -0.26 | -0.01 | 0.03 | -0.09 | -0.19 | -0.10 | -0.03 | -0.17 | -57 +- 42 | 983 / 1176 | neutral |
| mortar | 40 | 0.13 | -0.01 | 0.20 | 0.05 | -0.10 | 0.04 | -0.03 | 0.16 | +15 +- 33 | 1202 / 1143 | neutral |
| grapeshot | 54 | 0.06 | -0.10 | -0.01 | -0.14 | 0.10 | 0.19 | 0.06 | 0.04 | +28 +- 31 | 1175 / 1150 | neutral |
| 3+ grapeshot | 6 | -0.17 | -0.02 | -0.06 | -0.16 | 0.02 | 0.02 | -0.09 | -0.04 | +8 +- 49 | 986 / 1167 | neutral |
| flak | 49 | -0.12 | -0.02 | -0.11 | -0.10 | -0.03 | -0.04 | -0.14 | -0.05 | -89 +- 29 | 1125 / 1178 | hurts (not a trap) |
| harpoon | 43 | 0.20 | 0.04 | 0.01 | 0.06 | -0.04 | 0.04 | 0.12 | 0.09 | +24 +- 30 | 1223 / 1131 | neutral |
| flamethrower | 9 | -0.12 | -0.10 | -0.04 | 0.07 | -0.18 | -0.12 | 0.07 | 0.08 | -30 +- 38 | 1066 / 1166 | neutral |
| mine layer | 15 | -0.27 | -0.03 | -0.07 | -0.03 | -0.01 | -0.23 | -0.10 | -0.12 | -71 +- 37 | 998 / 1179 | **TRAP** |
| ram prow | 28 | 0.20 | 0.05 | 0.01 | -0.01 | 0.18 | 0.05 | 0.16 | -0.06 | -22 +- 42 | 1244 / 1138 | neutral |
| crew cannon | 22 | 0.09 | 0.08 | -0.14 | 0.01 | 0.02 | 0.12 | 0.05 | -0.09 | +68 +- 42 | 1202 / 1152 | neutral |
| armour 2+ cols | 92 | 0.23 | -0.01 | 0.29 | 0.05 | -0.11 | 0.09 | 0.11 | 0.11 | +29 +- 30 | 1194 / 1094 | neutral |
| armour 5+ cols | 35 | 0.14 | -0.12 | 0.24 | 0.07 | -0.17 | 0.09 | -0.11 | 0.16 | +8 +- 26 | 1211 / 1142 | neutral |
| sail | 45 | -0.00 | 0.02 | 0.01 | -0.15 | 0.10 | -0.09 | -0.05 | -0.08 | -8 +- 24 | 1159 / 1160 | neutral |
| lift engine | 18 | 0.14 | -0.02 | 0.04 | 0.14 | 0.13 | -0.08 | 0.03 | 0.15 | +56 +- 30 | 1236 / 1148 | helps (not dominant) |
| swivel engine | 7 | -0.08 | -0.04 | 0.00 | -0.02 | 0.01 | 0.07 | -0.07 | -0.02 | -55 +- 43 | 1088 / 1163 | neutral |
| 4+ engines | 12 | -0.22 | 0.05 | -0.24 | -0.09 | -0.07 | -0.15 | 0.06 | -0.02 | +32 +- 44 | 1008 / 1174 | neutral |
| 2 or fewer engines | 34 | 0.05 | 0.07 | 0.05 | -0.06 | -0.03 | -0.12 | 0.06 | 0.02 | -10 +- 27 | 1178 / 1154 | neutral |
| 2+ bags | 87 | 0.21 | 0.14 | 0.12 | 0.15 | 0.03 | 0.04 | -0.13 | 0.05 | -34 +- 25 | 1193 / 1104 | neutral |
| 3+ bags | 46 | 0.33 | 0.11 | 0.20 | 0.05 | 0.17 | 0.19 | 0.10 | 0.20 | +72 +- 39 | 1259 / 1111 | **DOMINANT** |
| twin envelope bag | 4 | -0.35 | -0.05 | -0.17 | -0.20 | -0.10 | -0.14 | 0.07 | 0.01 | -122 +- 54 | 730 / 1172 | **TRAP** |
| bomb bay | 7 | -0.16 | -0.01 | -0.18 | 0.02 | 0.16 | -0.02 | -0.11 | -0.03 | +102 +- 33 | 1016 / 1167 | helps (not dominant) |
| 2+ boilers | 38 | -0.53 | -0.09 | -0.29 | -0.14 | -0.19 | -0.13 | -0.07 | -0.08 | -114 +- 29 | 977 / 1227 | **TRAP** |
| upper nest | 34 | 0.11 | -0.06 | 0.02 | 0.10 | 0.06 | -0.10 | 0.16 | -0.01 | +6 +- 25 | 1201 / 1146 | neutral |
| keel deck | 56 | 0.13 | -0.15 | 0.20 | 0.02 | 0.03 | 0.01 | 0.15 | 0.18 | +5 +- 25 | 1193 / 1137 | neutral |
| towline | 11 | 0.09 | 0.05 | -0.13 | 0.20 | 0.05 | -0.00 | -0.00 | -0.12 | +6 +- 44 | 1227 / 1154 | neutral |
| cargo racks | 1 | - | - | - | - | - | - | - | - | too few | - | - |
| steam lift | 13 | 0.15 | 0.17 | 0.01 | -0.05 | 0.11 | -0.09 | 0.10 | 0.06 | +84 +- 36 | 1258 / 1149 | helps (not dominant) |
| 6+ guns | 46 | 0.08 | 0.03 | 0.17 | -0.04 | -0.17 | -0.04 | 0.01 | 0.07 | -11 +- 23 | 1183 / 1148 | neutral |
| ballast | 25 | -0.03 | 0.14 | 0.02 | -0.10 | -0.18 | 0.02 | -0.08 | -0.23 | -42 +- 33 | 1146 / 1162 | neutral |
| gas valves | 55 | 0.35 | -0.01 | 0.27 | 0.02 | 0.26 | 0.11 | 0.12 | 0.18 | -85 +- 39 | 1251 / 1100 | hurts (not a trap) |
| searchlight | 51 | -0.10 | 0.03 | -0.16 | 0.05 | -0.07 | -0.11 | 0.06 | -0.05 | +17 +- 23 | 1133 / 1175 | neutral |
| open main deck | 13 | 0.01 | -0.14 | -0.05 | 0.03 | 0.08 | 0.06 | 0.00 | 0.17 | -13 +- 31 | 1165 / 1159 | neutral |
| long hull | 49 | 0.17 | 0.05 | 0.22 | 0.07 | 0.08 | -0.05 | 0.02 | 0.03 | +16 +- 25 | 1208 / 1134 | neutral |
| short hull | 26 | -0.29 | -0.15 | -0.13 | -0.03 | -0.15 | 0.05 | -0.05 | -0.02 | -71 +- 27 | 1032 / 1189 | **TRAP** |

### Reading it

- DOMINANT: 3+ bags.
- TRAP: mine layer, twin envelope bag, 2+ boilers, short hull.
- situational: none.
- helps, not dominant: lift engine (+56), bomb bay (+102), steam lift (+84).
- hurts, not a trap: flak (-89), gas valves (-85).

## Limits (read before rebalancing anything)

- The crews are bots, 5 a side. A ship with more manned stations than hands (two long guns, a mine layer, a crew cannon and its seat, a lamp and a mortar ...) leaves guns idle, so "more of it" can lose; with human crews of 6-8 a side the answers move.
- The environments were written for ship 0 (the red ship): ice, spores, lightning, flooding and the oxygen tank hit the red ship only. Every pairing is played twice with the sides swapped, so a ship meets each hazard as the target and as the lucky one, but the per-environment columns mostly show how the hazard-carrying side fares.
- The shelf ships made from the classic ship carry things the editor cannot place (the deflector shield, two escort fighters, the lightning coil, the navigator), so the classic family out-rates a generated ship of the same weight; compare generated ships with each other first, and with the classic ship second.
- Part tags are confounded (a long hull, three bags and heavy armour usually come together in the fortress theme). The logistic effect holds the other tags fixed; the correlation does not. Where they disagree, trust neither without a targeted test (`tools/pvp-stats.mjs --set`).
- Co-op fitness is 3 voyage-mode voyages of 8 bots on Normal per ship (the voyage starts on the ship and the sky-dock Yard builds on it): a small sample, read it as "can she win a voyage at all".

