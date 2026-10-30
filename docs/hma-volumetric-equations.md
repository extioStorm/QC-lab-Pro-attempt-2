# Equations used in HMA volumetric analysis (laminated reference card, transcribed 2026-10-19)

Photo of a card titled "Equations Used in HMA Volumetric Analysis". The equations were legible; wording of the definitions is paraphrased lightly.

## Symbols
- Pmm = percent by mass of total loose mixture = 100
- Pb = asphalt (binder) content, percent by total mass of mixture
- Ps = aggregate content, percent by total mass of mixture (so Ps = 100 - Pb)
- Gb = specific gravity of the asphalt (binder)
- Gmm = maximum specific gravity of the paving mixture (no air voids), i.e. the Rice value
- Gmb = bulk specific gravity of the compacted mixture
- Gsb = bulk specific gravity of the aggregate
- Gse = effective specific gravity of the aggregate
- Pba = absorbed asphalt, percent by mass of aggregate
- Pbe = effective asphalt content, percent by total mass of mixture

## The equations (card order)

1. **Bulk specific gravity of the aggregate blend**
   Gsb = (P1 + P2 + ... + PN) / (P1/G1 + P2/G2 + ... + PN/GN)
   where P1..PN are the individual aggregate percentages by mass and G1..GN their individual bulk specific gravities.

2. **Effective specific gravity of the aggregate**
   Gse = (Pmm - Pb) / (Pmm/Gmm - Pb/Gb)

3. **Maximum specific gravity of a mixture at a different asphalt content**
   Gmm = Pmm / (Ps/Gse + Pb/Gb)

4. **Asphalt absorption**
   Pba = 100 x ((Gse - Gsb) / (Gsb x Gse)) x Gb

5. **Effective asphalt content**
   Pbe = Pb - (Pba / 100) x Ps

6. **VMA in the compacted mixture** (voids in mineral aggregate, percent of bulk volume)
   VMA = 100 - (Gmb x Ps) / Gsb

7. **Air voids in the compacted mixture** (percent of total volume)
   Va = 100 x (Gmm - Gmb) / Gmm

8. **VFA in the compacted mixture** (voids filled with asphalt, percent of VMA)
   VFA = 100 x (VMA - Va) / VMA

Note: on the card, the definition list under equation 2 prints "Pb = asphalt content" twice (a typo on the card); both mean Pb.

## Dependency chain (for the app)

Inputs by level:
- Mix design (set once): the individual aggregate percentages and bulk gravities (or the finished Gsb), binder specific gravity Gb, design Gmm.
- Plant sample: Pb (actual binder content from the ignition or gauge), Gmm (Rice test), Gmb (gyratory specimens).

Chain, in order:
- Gsb <- aggregate blend (mix design)
- Gse <- Pb, Gmm, Gb
- Pba <- Gse, Gsb, Gb
- Pbe <- Pb, Pba, Ps
- Va <- Gmm, Gmb
- VMA <- Gmb, Ps, Gsb
- VFA <- VMA, Va

These are the same quantities as the right-hand blocks of the gyro worksheet (see gyro-worksheet.md): Gse, Pba, Pbe, Avg. Voids, VMA %, Gsb.
