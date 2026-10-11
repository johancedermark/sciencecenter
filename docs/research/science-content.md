# Science content research: themes, exhibits and physics for the virtual science center

Research date: 2026-10-11. Constants are SI. Where a value is *derived* (computed by us from a cited formula) it is marked **(calc)**. Where sources gave a range, the range is given; pick a midpoint for simulation and keep the range for sanity checks.

---

## A) Most common themes across science centers

Sources surveyed: Science Museum London Wonderlab (7 zones: Forces, Electricity, Light, Sound, Matter/Materials, Space, Maths, per [Science Museum Learning](https://learning.sciencemuseumgroup.org.uk/how-science-capital-shaped-wonderlab/) and [Dezeen](https://www.dezeen.com/2016/10/11/muf-wonderlab-science-museum-gallery-london-slides-theatre/)); Phaeno (6 themes: Life, Vision, Energy, Dynamics, Sense, Maths, 350+ stations, [Wikipedia](https://en.wikipedia.org/wiki/Phaeno_Science_Center)); NEMO (floors Fenomena, Technium, Elementa, Humania, Energetica roof, [NEMO](https://www.nemosciencemuseum.nl/en/exhibitions/), [Energetica press release](https://www.nemosciencemuseum.nl/media/filer_public/6a/ab/6aab4f27-1b5e-426e-86a7-7dc6e192f9a4/20160302_nemo_persbericht_energetica_engels.pdf)); Exploratorium (Seeing & Listening, Human Phenomena, Living Systems, Tinkering, Bay Observatory, outdoor; [Ecsite](https://ecsite.eu/node/5524)); Experimentarium (body "Under the skin", Labyrinth of Light, Bubblearium, Port, 300+ installations, [Experimentarium](https://www.experimentarium.dk/exhibitions/)); Heureka (Heureka Classics, Science on a Sphere, AI, Water, space shows, [museot.fi](https://museot.fi/en/museums/heureka-suomalainen-tiedekeskus)); Deutsches Museum (20 permanent exhibitions incl. Physics, Astronomy, Planetarium, Energy Technology, Electric Power, Classical Optics, [Deutsches Museum](https://www.deutsches-museum.de/en/museum-island/visit), [meer.com](https://www.meer.com/deutschesmuseum/en)); Tekniska museet (MegaMind brain/perception, science center, planetarium/mine, [Royal Djurgården](https://royaldjurgarden.se/en/attractions/the-national-museum-of-science-and-technology/)); Universeum (rainforest, aquarium, space, chemistry lab, Mathrix maths, [Västsverige](https://www.vastsverige.com/en/foretagprodukter/goteborg/universeum/)); Ontario Science Centre (8 to 10 halls, 500+ stations; building closed June 2024, now in temporary sites, [NOW Toronto](https://nowtoronto.com/news/ontario-science-centre-moving-to-temporary-locations-at-sherway-gardens-and-harbourfront-centre/)).

No published survey ranks exhibit topics by frequency ([search of ASTC/Ecsite/NISE literature](https://archive.informalscience.org/sites/default/files/report_105.pdf) found none), so the counts below are our tally over the 10 centres.

| # | Theme | Appears in | Note |
|---|---|---|---|
| 1 | **Light, optics and colour** | 10/10 | Universal. Prisms, colored shadows, mirrors, polarisers. Wonderlab "Light", Phaeno "Vision", Experimentarium "Labyrinth of Light", Exploratorium "Seeing". |
| 2 | **Forces, motion and mechanics** | 10/10 | Pendulums, gyroscopes, rolling races, friction slides (Wonderlab), Phaeno "Dynamics". |
| 3 | **Perception, brain and human body** | 9/10 | Illusions, reaction time, senses. Tekniska MegaMind (its most popular exhibition), NEMO Humania, Experimentarium "Under the skin", Exploratorium Human Phenomena, Phaeno "Sense". |
| 4 | **Sound, waves and vibration** | 9/10 | Chladni plates, whisper dishes, standing waves. Usually paired with light (Exploratorium "Seeing & Listening"). |
| 5 | **Electricity, magnetism and energy** | 9/10 | Hand-crank/bike generators, plasma balls, Van de Graaff, solar. NEMO Energetica, Phaeno "Energy", Wonderlab "Electricity", Deutsches Museum Electric Power. |
| 6 | **Space and astronomy** | 9/10 | Planetaria or dome shows (Heureka Science on a Sphere, Universeum Wisdome, NEMO Elementa, Wonderlab solar-system model). |
| 7 | **Matter and chemistry** | 6/10 | Usually live demos or staffed labs rather than free exhibits (Universeum chemistry lab, Wonderlab "Matter", Deutsches Museum Chemistry), for safety reasons. A virtual center can offer it unstaffed. |

Runners-up: Maths/patterns (Wonderlab, Phaeno, Universeum Mathrix), Living systems/nature (Exploratorium, Universeum, Heureka Water), Tinkering/making.

---

## B) Rooms and exhibits

### B1. Electricity & Energy

**1. Hand-crank generator: incandescent vs LED**
- *Do:* Crank a generator wired by switch to an incandescent bulb, an LED bulb of equal brightness, nothing (open circuit), or a short circuit.
- *See:* Equal light, but the incandescent bulb needs far more effort. Open circuit spins freely. Short circuit is the hardest to turn. This is the classic "Pedal Power" bulb comparison ([UW CEI](https://cei.washington.edu/lesson-plans/pedal-power), [CSU Little Shop of Physics](https://hogback.atmos.colostate.edu/cmmap/scienceEd/summerCourse/summerCourse13/DemonstratingEfficiency.pdf)).
- *Physics:* Faraday: ε = −N dΦ/dt. For a coil rotating in a uniform field, ε(t) = N·B·A·ω·sin(ωt), so the peak EMF is ∝ crank speed. The load current I = ε/(R_load + R_coil) produces an opposing torque (Lenz) τ = P_elec/(η·ω). Use η ≈ 0.6 to 0.8 for a small generator with gearing.
- *Numbers:* A 60 W incandescent gives about 800 lm (~13 lm/W). An LED gives the same 800 lm at about 8 to 10 W (~80 to 120 lm/W), so crank torque is roughly 6 to 8× lower. A human sustains about 54 ± 14 W one-armed ([Design Society study](https://www.designsociety.org/download-publication/23972/human_power_comfortable_one-hand_cranking)) and about 75 W over a shift ([Wikipedia: Human power](https://en.wikipedia.org/wiki/Human_power)). So a person *can* light one 60 W incandescent bulb briefly, but can comfortably light 5 to 6 LED bulbs. Typical crank speed is 1 to 2 rev/s, geared about 1:20 to 1:50 to the generator.
- *Misconception:* "The generator makes energy" or "the crank is just stiff." The resistance *is* the energy leaving your arm. No current means no resistance.
- *Wow:* A 1-hour TV stream on a ~100 W TV would need you to crank at sprinting effort for the whole hour.

**2. Magnet falling through a copper tube (Lenz's law)**
- *Do:* Drop a neodymium magnet and an identical non-magnetic slug through copper, aluminium and plastic tubes.
- *See:* In a 50 cm tube the magnet takes about 5.0 s in copper, 3.7 s in aluminium and 0.3 s in plexiglass ([Leybold 560361](https://www.leybold-shop.com/physics/physics-equipment/electricity-electronics/electromagnetism-and-induction/lenz-s-law/lenz-s-law-demonstrator-560361.html)). In a 1.7 m tube it takes over 20 s ([arXiv physics/0603270](https://arxiv.org/pdf/physics/0603270v1)).
- *Physics:* The changing flux induces eddy currents whose field opposes the motion ([IOP Spark](https://spark.iop.org/electromagnetic-braking-copper-pipe)). The drag force is ∝ v·σ (conductivity), so the magnet reaches terminal velocity almost immediately: v_t = m·g/k with k ∝ σ·m_dip²·w/a⁴ (w = wall thickness, a = radius). For the simulation, fit k so that v_t(Cu) = 0.1 m/s (0.5 m in 5 s). Then v_t(Al) ≈ 0.135 m/s (from the Leybold times). Conductivity: σ_Cu = 5.96×10⁷ S/m, σ_Al = 3.77×10⁷ S/m. Cooling copper in liquid nitrogen raises σ about 7× and slows the magnet further.
- *Misconception:* "Copper is magnetic" or "the magnet sticks to the wall." Copper is not ferromagnetic, and a stationary magnet feels no force.
- *Wow:* The tube gets (very slightly) warm. The magnet's lost potential energy becomes heat in the copper.

**3. Lemon battery and Volta pile**
- *Do:* Push Zn and Cu electrodes into lemons and wire them in series or parallel. Try to light an LED. Stack Zn/cardboard-brine/Cu discs into a Volta pile.
- *Physics:* E°cell = E°cathode − E°anode = +0.34 − (−0.76) = 1.10 V (Daniell cell, standard conditions). A real lemon measures about 0.85 to 0.9 V open-circuit and about 0.25 to 1 mA ([UIUC Ask the Van](https://van.physics.illinois.edu/ask/listing/2401), [ANU](https://science.anu.edu.au/engagement/science-lab-experiments-home-school/how-make-lemon-battery)). Internal resistance is about 0.5 to 3 kΩ. In the lemon the cathode reaction is mostly 2H⁺ + 2e⁻ → H₂ on copper, not Cu²⁺ deposition. Series: V = n·0.9 V. Red LED: V_f ≈ 1.8 to 2.0 V, visible at ≥0.5 mA, so it needs 3 lemons and 4 is reliable. A 4 to 5 lemon series gives 2.5 to 3.0 V ([Science Buddies](https://www.sciencebuddies.org/science-fair-projects/ask-an-expert/viewtopic.php?p=35124)).
- *Misconception:* "The energy comes from the lemon juice." It comes from zinc oxidising. The acid is the electrolyte, and the zinc gets used up.
- *Wow:* Charging a phone (about 15 Wh) would take roughly 20,000+ lemons in a series-parallel array (calc: 0.9 V × 1 mA ≈ 1 mW per lemon).

**4. Solar cell, take apart layer by layer** (the flagship exhibit, see table)
- *Do:* Disassemble a module into an exploded view. Shine light of chosen wavelength or intensity. Watch the voltmeter and ammeter. Shade one cell.
- *Physics:* A photon with E = hc/λ ≥ E_g = 1.12 eV (Si, 300 K) creates an electron-hole pair. The cutoff is λ_max = 1240/1.12 ≈ **1107 nm (calc)**, so IR beyond this passes through. Excess energy above 1.12 eV becomes heat, which is the main loss. The junction's built-in field separates the carriers. Diode equation: I = I_L − I₀[exp(qV/(n·k·T)) − 1], with kT/q = 25.7 mV at 25 °C. Standard test conditions (STC): 1000 W/m², AM1.5G, 25 °C. Si theoretical limit **29.4%** (Auger-limited, [Richter 2013 via Fraunhofer](https://publica.fraunhofer.de/handle/publica/233767)). Record cell **27.81%** (LONGi HIBC, ISFH-certified April 2025, V_oc 744.9 mV, FF 87.55%, [pv magazine](https://www.pv-magazine.com/2025/04/14/longi-claims-worlds-highest-efficiency-for-silicon-solar-cells/)). Record module 25.4% ([SolarQuarter](https://solarquarter.com/2024/10/25/longi-broke-the-world-record-for-efficiency-of-crystalline-silicon-modules-with-a-25-4-module-efficiency-of-hpbc2-0/)). Classic Al-BSF industrial cells reach about 19 to 20%, PERC about 22 to 23%, commercial modules about 20 to 23%.

| Layer (front to back) | Typical thickness | Function / numbers |
|---|---|---|
| Tempered low-iron glass (often AR-coated) | 3.2 mm | ~91% transmission (~94% with AR coat). Protects the cell. |
| EVA encapsulant (front) | ~0.45 mm | Glues and cushions. UV-stable. n ≈ 1.48. |
| Front Ag fingers + busbars | fingers ~30 to 100 µm wide (older 100 to 200 µm), ~3 mm pitch ([PVEducation](https://www.pveducation.org/pvcdrom/manufacturing-si-cells/screen-printed-solar-cells)) | Collect electrons. Shade ~3 to 5% of the area. |
| SiNx anti-reflection + passivation | **~75 nm**, n ≈ 1.9 to 2.1 ([patent range 50 to 100 nm, n 1.9 to 2.3](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8697475)) | Quarter-wave: d = λ₀/(4n) = 600/(4·2.0) = 75 nm. Ideal n = √(n₀·n_Si) ([PVEducation ARC](https://www.pveducation.org/pvcdrom/design-of-silicon-cells/anti-reflection-coatings)). It makes the cell look dark blue. Bare Si reflects >30% (calc: ((3.9−1)/(3.9+1))² ≈ 35%). The H in SiNx passivates defects. |
| Textured surface (random pyramids) | 1 to 10 µm pyramids | Light bounces twice, cutting reflection to <10% before the ARC and ~2 to 3% with it. |
| n⁺ emitter (phosphorus-diffused) | ~0.3 to 0.5 µm deep, ~10²⁰ cm⁻³ surface ([Boumerdes simulation](https://dspace.univ-boumerdes.dz/items/0b80169b-6e04-40b2-acde-ec04ab950be5)) | Sheet resistance ~60 to 120 Ω/□. Supplies the n side. |
| p-n junction / depletion region | ~0.1 to 1 µm | Built-in voltage ~0.7 to 0.9 V. The field separates e⁻ (to the front) and holes (to the back). |
| p-type Si base (boron, ~1 Ω·cm, ~10¹⁶ cm⁻³) | 150 to 180 µm | Absorbs most light. Red light (~1 µm) needs ~100+ µm because Si has an indirect band gap. |
| p⁺ Al back-surface field (BSF) | ~5 to 10 µm | Formed when the Al paste alloys into Si at firing (~800 °C). Its field repels electrons from the rear. |
| Screen-printed Al rear contact | ~20 to 30 µm | Collects holes. Reflects some IR back. |
| EVA (rear) + backsheet (PET/fluoropolymer) | 0.45 mm + ~0.3 mm | Moisture barrier and electrical insulation. |
| Al frame, junction box with bypass diodes | — | Each bypass diode spans ~20 cells and prevents hot-spots under shading. |

Cell output: V_oc ≈ 0.63 V (Al-BSF) to 0.74 V (best). J_sc ≈ 37 to 42 mA/cm². A 60-cell module gives V_oc ≈ 38 V. Temperature coefficient of P_max ≈ −0.35 to −0.45 %/K.
- *Misconception:* "Solar cells use heat" or "more light colour = more power." Hotter cells are *less* efficient. A blue photon gives the same single electron as a red one, and the extra energy is wasted as heat.
- *Wow:* The silicon in a cell is thinner than two sheets of paper, and the blue coating is ~1/1000 the thickness of a hair.

**5. Hand battery (bonus, pairs with the lemon)**
- *Do:* Put one hand on a copper plate and one on an aluminium plate. A microammeter deflects.
- *Physics:* Sweat is the electrolyte. E°(Al³⁺/Al) = −1.66 V, but the oxide film lowers the real value to ~0.5 to 0.8 V and the current to ~µA.
- *Misconception:* "My body makes the electricity." The metals do. Swap both hands to copper and the reading is ~0.
- *Wow:* Two different coins and your tongue work too (the "battery taste").

### B2. Light & Optics

**1. Prism dispersion**
- *Physics:* Snell's law: n₁·sinθ₁ = n₂·sinθ₂. N-BK7 glass: n_F(486 nm) = 1.52238, n_d(589 nm) = 1.51673, n_C(656 nm) = 1.51432, Abbe V_d = 64.17 ([PMOptics](https://pmoptics.com/refractive_index_abbe_value.html)). Interpolate with a Cauchy fit, n(λ) ≈ A + B/λ², with A ≈ 1.5046 and B ≈ 4.20×10³ nm² (calc from F and C lines). Minimum deviation: n = sin((A_p + D_min)/2)/sin(A_p/2). For a 60° prism, D_min ≈ 38.4° for red (C line) and 39.1° for blue (F line) (calc), a ~0.7° spread. Flint glass (n ≈ 1.62, V ≈ 36) spreads about twice as much.
- *Misconception:* "The prism adds colour to light." Newton's 2-prism test shows it only separates colours, and a second prism recombines them.
- *Wow:* A rainbow is the same effect, using a billion raindrops as prisms at 42° from your shadow's head.

**2. Coloured shadows (additive RGB)**
- *Do:* Three lamps (R, G, B) light a white wall. Put your hand in front.
- *See:* Where all three overlap the wall is white. A shadow blocking R appears **cyan** (G+B), blocking G gives **magenta**, blocking B gives **yellow**. Where two lamps are blocked you get pure R, G or B, and where all three are blocked, black. (Exploratorium "Colored Shadows" Snack.)
- *Sim:* Wall colour = sum of unblocked lamp RGB vectors. Use additive blending, with a separate shadow map per light.
- *Misconception:* "Red + green = brown" (paint thinking). With light, R+G = yellow, because mixing is additive while pigments are subtractive.
- *Wow:* Your phone screen makes every colour from just these three subpixels.

**3. Polarisers**
- *Physics:* Malus's law: I = I₀·cos²θ. Unpolarised light through one polariser gives I₀/2. Two crossed polarisers give 0, but inserting a third at 45° gives I₀/8. Brewster angle tan θ_B = n₂/n₁, which is 56.3° for glass.
- *Misconception:* "Polarisers are just dark glass." Rotation changes the result, while dark glass does not.
- *Wow:* Tilting your head with polarised sunglasses makes an LCD screen go black.

**4. Lens and image formation**
- *Physics:* 1/f = 1/d_o + 1/d_i, with magnification m = −d_i/d_o. The image is real and inverted when d_o > f, and virtual and upright when d_o < f. The eye's lens has ~+60 dioptres total power.
- *Misconception:* "Covering half the lens cuts off half the image." The whole image remains, just dimmer.
- *Wow:* The image on your retina is upside down, and your brain flips it.

### B3. Sound & Waves

**1. Chladni plate**
- *Do:* Sweep a driver's frequency (or bow the edge) under a sand-covered plate.
- *See:* Sand collects on the nodal lines. Patterns grow more complex as frequency rises ([UCSB](https://web.physics.ucsb.edu/~lecturedemonstrations/Composer/Pages/44.45.html), [Arbor](https://arborsci.com/products/chladni-plates-kit); Chladni 1787).
- *Physics:* Kirchhoff plate: f ∝ (h/a²)·√(E/(ρ(1−ν²))). Steel: E = 200 GPa, ρ = 7850 kg/m³, ν = 0.3. Sim approximation for a free square plate: z = cos(nπx/L)cos(mπy/L) ± cos(mπx/L)cos(nπy/L), with x,y ∈ [−L/2, L/2]. Use f_nm ∝ (n² + m²) and move sand particles down the |z| gradient toward zero.
- *Misconception:* "Sand goes where vibration is strongest." It is thrown *off* antinodes and settles where the plate is still.
- *Wow:* Ernst Chladni showed this to Napoleon, who offered a 3000-franc prize for explaining it.

**2. Standing waves on a string**
- *Physics:* v = √(T/μ) and f_n = n·v/(2L). Nodes sit at x = kL/n. Example: L = 1 m, T = 50 N, μ = 1 g/m gives v = 224 m/s and f₁ = 112 Hz (calc). Doubling the tension raises pitch by √2.
- *Misconception:* "The wave isn't moving." It is two travelling waves going in opposite directions.
- *Wow:* Every guitar string vibrates in many harmonics at once, which is why a guitar and a piano playing the same note sound different.

**3. Doppler effect**
- *Physics:* f′ = f·(v ± v_o)/(v ∓ v_s). Speed of sound v = 331.3 + 0.606·T(°C), which is 343 m/s at 20 °C. Example: a 440 Hz source at 20 m/s is heard as 467 Hz approaching and 416 Hz receding (calc).
- *Misconception:* "It gets higher because it gets louder or closer." The pitch is constant while approaching and drops suddenly as the source passes.
- *Wow:* Astronomers use the same effect with light (redshift) to measure how fast galaxies move away.

**4. Whisper dishes (parabolic reflectors)**
- *Physics:* A paraboloid y = x²/(4f) reflects all rays from the focus into parallel rays. Two dishes 10 to 20 m apart let a whisper (~30 dB) be heard. Air attenuates high frequencies, and sound intensity falls as 1/r² without the dishes.
- *Misconception:* "Sound travels through a hidden tube." It is pure reflection.
- *Wow:* St Paul's Cathedral's Whispering Gallery works on the same reflection principle.

**5. Hearing range sweep**
- *Physics:* Human hearing spans 20 Hz to 20 kHz, with the upper limit dropping with age (often <15 kHz by 50). L = 10·log₁₀(I/I₀) dB, with I₀ = 10⁻¹² W/m². +10 dB ≈ "twice as loud".
- *Wow:* Kids hear "mosquito tones" (~17 kHz) that their parents can't.

### B4. Forces & Motion

**1. Brachistochrone race**
- *Physics:* The fastest frictionless path is a cycloid: x = R(θ − sinθ), y = R(1 − cosθ), with descent time T = π·√(R/g) from any start point (tautochrone). Example: R = 0.5 m (1 m drop, 1.57 m horizontal) gives a cycloid time of **0.709 s** vs **0.841 s** on a straight ramp (calc). Use a rolling ball with a = (5/7)·g·sinθ for a solid sphere, which scales all times by √(7/5).
- *Misconception:* "The shortest path is fastest." The dip gains speed early.
- *Wow:* Balls released from different heights on a cycloid all arrive at the bottom at the same time.

**2. Pendulum wave**
- *Physics:* T = 2π√(L/g) (small angle). Choose pendulum k to do N + k swings in Γ = 60 s, so L_k = g·(Γ/(N+k))²/(4π²) ([SDSMT report](https://webpages.sdsmt.edu/~twalker/pdfs/coursework/hc407/2016s/2016s_hc407_ks_pendulum_wave_report.pdf), [Wolfram](https://demonstrations.wolfram.com/PendulumWaves/)). Example: 15 pendulums with 51 to 65 swings per minute give lengths **0.344 m to 0.212 m** (calc, g = 9.81). Pattern realigns every 60 s, with half-cycle "two-row" patterns at 30 s.
- *Misconception:* "The pendulums are connected." Each is independent, and the pattern is purely phase.
- *Wow:* A pendulum's period doesn't depend on its mass.

**3. Newton's cradle**
- *Physics:* Momentum conservation (Σm·v) *and* kinetic energy conservation together force "n balls in, n balls out." Steel coefficient of restitution e ≈ 0.95. The sim should treat it as near-elastic sequential collisions with small energy loss per hit.
- *Misconception:* "Momentum alone explains it." One ball out at 2v would also conserve momentum. Energy conservation rules it out.
- *Wow:* The pulse crosses the middle balls as a sound wave at ~5 km/s.

**4. Gyroscope**
- *Physics:* ω_p = τ/L = m·g·r/(I·ω) ([OpenStax UP1 §11.4](https://openstax.org/books/university-physics-volume-1/pages/11-4-precession-of-a-gyroscope)). Example: a 0.3 kg disk at 20 rev/s with r = 0.05 m gives ω_p = 3.12 rad/s (period ~2.0 s). Faster spin means slower precession.
- *Misconception:* "Spinning cancels gravity." Gravity's torque turns the axis sideways instead of tipping it.
- *Wow:* The Hubble telescope points using gyroscopes spinning at 19,200 rpm.

**5. Rolling race (hoop vs disk vs sphere)**
- *Physics:* a = g·sinθ/(1 + I/(m·r²)), with I/(m·r²) = 1 (hoop), 1/2 (disk), 2/5 (solid sphere). Fractions of g·sinθ: 0.50, 0.67, 0.71. The sphere always wins regardless of mass or size.
- *Wow:* A can of soup filled with liquid beats a frozen one.

### B5. Space & Astronomy

**1. Your weight on other worlds** (NASA [Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/), equatorial g including rotation; gas giants at the 1-bar level)

| Body | g (m/s²) | 30 kg kid "weighs" (kg-equivalent) | Escape v (km/s) |
|---|---|---|---|
| Mercury | 3.7 | 11.3 | 4.3 |
| Venus | 8.9 | 27.2 | 10.4 |
| Earth | 9.8 | 30 | 11.2 |
| Moon | 1.6 | 4.9 | 2.4 |
| Mars | 3.7 | 11.3 | 5.0 |
| Jupiter | 23.1 | 70.7 | 59.5 |
| Saturn | 9.0 | 27.6 | 35.5 |
| Uranus | 8.7 | 26.6 | 21.3 |
| Neptune | 11.0 | 33.7 | 23.5 |
| Pluto | 0.7 | 2.1 | 1.3 |

Jump height scales as 1/g: a 0.5 m jump on Earth becomes ~3 m on the Moon.
- *Misconception:* "Your mass changes." Mass is constant, and only weight (F = m·g) changes. Also, astronauts in orbit are not in zero gravity; g at ISS altitude is ~8.7 m/s², and they are in free fall.

**2. Solar system to scale** (calc from NASA diameters and distances): if the Sun is a 1 m ball, Mercury is 3.5 mm at 42 m, Venus 8.7 mm at 78 m, **Earth 9.2 mm at 107 m**, Mars 4.9 mm at 164 m, Jupiter 103 mm at 559 m, Saturn 87 mm at 1.03 km, Uranus 37 mm at 2.06 km, Neptune 36 mm at 3.24 km. Sunlight takes 8.3 min to reach Earth.
- *Sim tip:* Offer two toggles: "true size" and "true distance". Both cannot fit in one room, and that is the lesson.
- *Wow:* All the planets would fit in the gap between Earth and the Moon (384,400 km).

**3. Moon phases**
- *Physics:* The synodic month is 29.53 d and the sidereal month 27.32 d. Lit fraction = (1 − cos φ)/2, where φ is the Sun-Moon elongation. Sim: one lamp (Sun), the visitor's head is Earth, and a white ball orbits.
- *Misconception:* "Phases are Earth's shadow." That is a lunar eclipse, which happens only at full moon.
- *Wow:* We always see the same face because the Moon rotates exactly once per orbit.

**4. Gravity well / orbits**
- *Physics:* Kepler III: T² = 4π²a³/(G·M). G = 6.674×10⁻¹¹ N·m²/kg², M_sun = 1.989×10³⁰ kg. Circular orbit speed v = √(GM/r), which is 29.8 km/s for Earth. A coin funnel shows faster motion closer in (vis-viva).
- *Wow:* Mercury moves at 47 km/s, so Stockholm to Gothenburg would take 10 seconds.

### B6. Perception & the Human Body (pick, appears in 9/10 centers)

**1. Reaction time (ruler drop)**
- *Physics:* t = √(2d/g). 20 cm gives 0.20 s and 26 cm gives 0.23 s ([Omni](https://omnicalculator.com/physics/reaction-time), [NRICH](https://nrich.maths.org/7033)). Visual reaction time is typically 200 to 300 ms, and auditory is ~150 ms. Randomise the drop delay (1 to 4 s) to stop anticipation.
- *Misconception:* "Reflexes are instant." The signal must travel eye → brain → hand at ~10 to 100 m/s along nerves.
- *Wow:* At 100 km/h a car travels ~6 m before you even start braking.

**2. Blind spot**
- Optic disc ~1.5 mm, about 15° temporal from fixation and ~5° wide. Sim: a dot and a cross 15° apart; the dot vanishes at the right distance. The brain "fills in" the gap.

**3. Negative afterimage**
- Stare at a saturated colour for ~20 to 30 s, then look at white to see the complementary colour (red → cyan), caused by cone adaptation. *Misconception:* it is "burned into your eye". In fact it fades in seconds.

**4. Illusions: Adelson checker-shadow, Müller-Lyer, Ames room**
- In the checker-shadow illusion, squares A and B are the identical RGB value. Let visitors drag a bridge strip to prove it. The Ames room is a trapezoid (one corner ~2× farther away) seen through one peephole, built in 3D with forced perspective. *Lesson:* the brain infers rather than measures.

**5. Bonus chemistry station (if a Chemistry room is added later)**
- *Flame tests* ([LibreTexts](https://chem.libretexts.org/Bookshelves/Inorganic_Chemistry/Supplemental_Modules_and_Websites_(Inorganic_Chemistry)/Descriptive_Chemistry/Elements_Organized_by_Block/1_s-Block_Elements/Group__1%3A_The_Alkali_Metals/2Reactions_of_the_Group_1_Elements/Flame_Tests), [PhysicsOpenLab](https://physicsopenlab.org/?p=15489)). E = hc/λ.
  - Na: 589.0/589.6 nm (D lines), intense yellow, 2.10 eV.
  - Li: 670.8 nm, crimson.
  - K: 766.5/769.9 nm plus a weak 404.4 nm line, lilac (mostly IR-adjacent red plus violet).
  - Sr: scarlet, from SrOH/SrCl molecular bands at 600 to 700 nm (not one line).
  - Cu: green to blue-green, from CuCl/CuOH bands at ~500 to 550 nm (blue with chloride).
  - Use line spectra for Na, Li and K but band spectra for Sr and Cu.
- *Red cabbage* (anthocyanin) ([Science Buddies](https://www.sciencebuddies.org/science-activities/cabbage-pH-indicator), [UIUC IGB](https://www.igb.illinois.edu/sites/default/files/uploads/Cabbage%20pH%20indicator%20Activity_0.pdf)): pH 2 red, 4 purple, 6 to 7 violet, 8 blue, 10 blue-green, 12 greenish-yellow. Example materials: lemon juice ~2, vinegar ~2.5 to 3, water 7, baking soda ~8.3, soap ~10, washing soda ~11.5.

---

## C) Foucault pendulum for the lobby (Stockholm)

- **Formula:** precession rate Ω_F = Ω_E·sin φ, where Ω_E is Earth's *sidereal* rate = 360°/23.9345 h = **15.041 °/h** (7.292×10⁻⁵ rad/s) ([UNSW](https://www.animations.physics.unsw.edu.au/jw/pendulumdetails.html), [SciELO](https://www.scielo.br/j/rbef/a/hsv8dhmVLGM85JyyM8W3H9k/?lang=en)). Full turn: T_F = 23.9345 h / sin φ. Clockwise (seen from above) in the northern hemisphere. Zero at the equator.
- **Stockholm, φ = 59.33° N** (calc): sin φ = 0.86012, so
  - **Ω_F = 12.94 °/h** (= 6.272×10⁻⁵ rad/s ≈ 0.216 °/min)
  - Full 360° in **27.83 h**, or ~310.5° per 24 h solar day
  - Turning 90° takes ~7 h.
- **Pendulum period:** T = 2π√(L/g), with g_Stockholm ≈ 9.818 m/s². A 10 m pendulum has T ≈ 6.34 s, 20 m gives 8.97 s and 30 m gives 10.98 s (calc). The original Panthéon pendulum (1851) was 67 m with a 28 kg bob, T ≈ 16.4 s ([Wikipedia](https://en.wikipedia.org/wiki/Foucault_pendulum)). Stockholm has its own reference installation at [foucaultpendel.se](https://foucaultpendel.se/ver64eng.html).
- **Sim tips:** Integrate in Earth's rotating frame with a Coriolis term (ẍ = −(g/L)x + 2Ω_z·ẏ, ÿ = −(g/L)y − 2Ω_z·ẋ, Ω_z = Ω_E·sin φ). Add a time-acceleration slider (e.g. 1 real minute = 1 h). Ring the base with pegs every ~13° that get knocked over hourly. Keep amplitude small (<5°) to avoid ellipse-precession artefacts.
- *Misconception:* "The pendulum turns." The floor (Earth) turns under it. *Wow:* it was the first indoor proof that Earth spins, with no telescope needed.

---

## D) Pedagogical design principles

1. **Immediate apprehendability.** A first-time visitor should grasp in seconds what to do and what it's about ([Allen 2004, *Science Education* 88:S1](https://informalscience.org/research/designs-learning-studying-science-museum-exhibits-do-more-entertain)). Show one obvious affordance (a glowing crank), not a menu.
2. **Physical interactivity, but not too much.** Allen's Exploratorium research found that interactivity drives engagement, but stacking several interactive features on one exhibit can make them interfere with each other. One phenomenon per station.
3. **Conceptual coherence.** Group exhibits so ideas build. In the Electricity room, the chain lemon → crank → magnet tube → solar cell all lead to "energy is converted, never created."
4. **Active Prolonged Engagement (APE).** The Exploratorium's NSF-funded APE project treats exhibits as *tools for self-directed exploration rather than authoritative demonstrations*, maximising visitor-authored questions ([APE](https://informalscience.org/project/going-ape-fostering-active-prolonged-engagement-science-museum-exhibits/), [Humphrey & Gutwill, *Fostering APE*](https://informalscience.org/research/fostering-active-prolonged-engagement-art-creating-ape-exhibits/)). Design for:
   - *open-endedness and multiple outcomes*: free frequency sweeps on the Chladni plate, any number of lemons, any wavelength on the solar cell;
   - *immediate, continuous feedback*: a live meter, bulb glow, sand moving;
   - *visitor-set challenges*: "can you light the LED with fewest lemons?";
   - *social play*: two-player crank races and shared shadows.
5. **Diversity of learners.** Layer the content: a 5-second wow for kids, a "Why?" panel for adults, and a formula drawer for experts. Allen's fourth focus area is serving diverse visitors.
6. **Science capital.** Wonderlab was designed to connect phenomena to visitors' everyday lives and identities ([Science Museum Group](https://learning.sciencemuseumgroup.org.uk/how-science-capital-shaped-wonderlab/)). Link each exhibit to home ("your phone screen", "the LED in your kitchen").
7. **Predict, observe, explain.** Ask for a guess before revealing ("Which falls faster?"). This is especially powerful for the misconceptions listed above. Pair each exhibit with its misconception and a one-tap prediction.
8. **Safe failure and surprise.** Allow short circuits, overcranking and wrong wiring, with a playful consequence (a fuse "pops"). Phenomenon-based hands-on exhibits remain the dominant, best-attended format ([UWE study of At-Bristol/Techniquest](https://uwe-repository.worktribe.com/OutputFile/832080)).

**Accuracy guardrails for the build:** keep a single `constants.ts` with the values above (g, σ_Cu, E_g, n(λ), Ω_E), unit-test the formulas against the (calc) examples in this doc, and label any deliberate simplification ("small-angle approximation") in the UI.
