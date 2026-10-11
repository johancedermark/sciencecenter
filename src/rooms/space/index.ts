/**
 * Rymden / Space: a planetarium room with an orrery, a cosmic bathroom scale, Moon phases,
 * a gravity well and light-speed mail.
 */
import type { RoomDef } from '../../core/types';
import { L } from '../../core/i18n';
import { buildDecor } from './decor';
import { buildOrrery, ORRERY_POS } from './orrery';
import { buildWeight, WEIGHT_POS } from './weight';
import { buildPhases, PHASES_POS } from './phases';
import { buildGravityWell, WELL_POS } from './gravityWell';
import { buildLightMail, MAIL_POS } from './lightMail';
import { makeBuddy, makeNearCheck } from './shared';

export const spaceRoom: RoomDef = {
  id: 'space',
  title: L('Rymden', 'Space'),
  subtitle: L('Planeter, gravitation och ljusets långa resa', 'Planets, gravity and the long journey of light'),
  icon: '🪐',
  accent: 0x8f7bff,
  greeting: L(
    'Välkommen ut i rymden! Titta upp, stjärnorna blinkar. Här kan du snurra solsystemet, väga dig på Jupiter och skicka ljuspost till Neptunus.',
    'Welcome to space! Look up, the stars are twinkling. Here you can spin the solar system, weigh yourself on Jupiter and send light-speed mail to Neptune.',
  ),
  build(ctx) {
    const buddy = makeBuddy(ctx);
    const near = makeNearCheck(ctx);
    const decor = buildDecor(ctx);
    const orrery = buildOrrery(ctx, buddy);
    const weight = buildWeight(ctx, buddy);
    const phases = buildPhases(ctx, buddy);
    const well = buildGravityWell(ctx, buddy);
    const mail = buildLightMail(ctx, buddy);
    let wellFocused = false;

    ctx.addLight({ position: [ORRERY_POS[0], 1.5, ORRERY_POS[1]], color: 0xffb862, intensity: 16, distance: 6 });

    ctx.addStation({
      id: 'space-orrery',
      title: L('Solsystemet i rörelse', 'The solar system in motion'),
      position: ORRERY_POS,
      viewpoint: { position: [0.3, 2.6, 0.7], target: [0.5, 0.95, -3.0] },
      intro: L(
        'Här snurrar hela solsystemet! Varje planet tar sin riktiga tid på sig runt Solen, och datumet visar ungefär var de är i dag.',
        'The whole solar system spins here! Every planet takes its real time to go round the Sun, and the date shows roughly where they are today.',
      ),
      howTo: L(
        'Dra i tidsreglaget eller dra Jorden runt sin bana. Klicka på en planet för fakta och prova knapparna för sann skala.',
        'Use the time slider or drag Earth along its orbit. Click a planet for facts and try the true-scale buttons.',
      ),
      science: L(
        'Planeterna går runt Solen för att Solens gravitation hela tiden böjer av deras färd. Ju längre ut, desto svagare drag och desto längre väg: Merkurius tar 88 dygn, Jorden 1 år och Neptunus 164,8 år (Keplers tredje lag, T² ∝ a³). Ingen modell kan visa både storlekar och avstånd rätt: om Solen vore 1 m bred skulle Jorden vara 9,2 mm stor och ligga 107 m bort, och Neptunus 3,2 km bort. Bilder i böcker får planeterna att se tätt packade ut, men solsystemet är nästan bara tomrum. Modellen använder cirkelbanor, så positionerna är ungefärliga.',
        'The planets go round the Sun because the Sun\'s gravity keeps bending their paths. Further out the pull is weaker and the path longer: Mercury takes 88 days, Earth 1 year and Neptune 164.8 years (Kepler\'s third law, T² ∝ a³). No model can get both sizes and distances right: if the Sun were 1 m wide, Earth would be 9.2 mm across and 107 m away, and Neptune 3.2 km away. Pictures in books make the planets look tightly packed, but the solar system is almost entirely empty space. The model uses circular orbits, so the positions are approximate.',
      ),
      wow: L(
        'Alla de andra planeterna skulle få plats inuti Jupiter, men Jupiter är ändå bara en tiondel så bred som Solen.',
        'All the other planets would fit inside Jupiter, yet Jupiter is only a tenth as wide as the Sun.',
      ),
      controls: orrery.controls,
    });

    ctx.addStation({
      id: 'space-weight',
      title: L('Din vikt på andra världar', 'Your weight on other worlds'),
      position: WEIGHT_POS,
      viewpoint: { position: [-6.2, 1.9, -4.2], target: [-5.6, 1.7, -8.6] },
      intro: L(
        'Hur mycket skulle du väga på Månen eller på Jupiter? Kliv upp på den kosmiska vågen!',
        'How much would you weigh on the Moon or on Jupiter? Step onto the cosmic scale!',
      ),
      howTo: L(
        'Ställ in din massa och välj en värld med knapparna eller globerna. Tryck Hoppa för att se samma hopp på nio världar.',
        'Set your mass and pick a world with the buttons or the globes. Press Jump to see the same jump on nine worlds.',
      ),
      science: L(
        'Massa är hur mycket materia du består av, och den är densamma överallt. Tyngd är kraften F = m·g som en himlakropp drar dig med, och g är 9,81 m/s² på Jorden, 1,62 på Månen och 24,79 på Jupiter (vid 1 bars tryck, Jupiter har ingen fast yta). En våg mäter kraften men visar kg som om du stod på Jorden. Med samma fart uppåt blir hopphöjden h = v²/(2g), så 40 cm här blir 2,4 m på Månen. Många tror att man blir lättare för att massan minskar, men den är exakt densamma: det är bara dragningen som ändras.',
        'Mass is how much matter you are made of, and it is the same everywhere. Weight is the force F = m·g with which a world pulls on you, and g is 9.81 m/s² on Earth, 1.62 on the Moon and 24.79 on Jupiter (at 1 bar pressure, since Jupiter has no solid surface). A scale measures the force but shows kg as if you stood on Earth. With the same take-off speed, jump height is h = v²/(2g), so 40 cm here becomes 2.4 m on the Moon. Many people think you get lighter because your mass shrinks, but it stays exactly the same: only the pull changes.',
      ),
      wow: L(
        'Astronauterna på rymdstationen är inte tyngdlösa: gravitationen där uppe är nästan 90 % av den på marken. De svävar för att de hela tiden faller runt Jorden.',
        'Astronauts on the space station are not weightless: gravity up there is almost 90 % of that on the ground. They float because they are constantly falling around Earth.',
      ),
      controls: weight.controls,
    });

    ctx.addStation({
      id: 'space-moon-phases',
      title: L('Månens faser', 'Phases of the Moon'),
      position: PHASES_POS,
      viewpoint: { position: [6.4, 1.85, -2.6], target: [6.75, 1.2, -5.4] },
      intro: L(
        'Varför byter Månen form? Lampan är Solen, och du styr Månen.',
        'Why does the Moon change shape? The lamp is the Sun, and you are in charge of the Moon.',
      ),
      howTo: L(
        'Dra Månen runt Jorden eller tryck Spela. Titta i fönstret: där ser du Månen som vi ser den från Jorden.',
        'Drag the Moon around Earth or press Play. Look in the porthole: it shows the Moon as we see it from Earth.',
      ),
      science: L(
        'Solen lyser alltid upp exakt halva Månen. Under en månad ser vi olika mycket av den ljusa halvan, beroende på vinkeln α mellan Solen och Månen sett från Jorden: den belysta andelen är (1 − cos α)/2. Från nymåne till nymåne tar det 29,5 dygn, och i Sverige är en tilltagande måne ljus på höger sida. Många tror att faserna kommer av Jordens skugga, men skuggan pekar alltid bort från Solen och når Månen bara vid fullmåne: då blir det en månförmörkelse. Månens bana lutar 5° (här överdrivet till 18°), så oftast passerar fullmånen ovanför eller under skuggan; slå på förmörkelsesäsong för att se en förmörkelse. Modellen är inte skalenlig: i verkligheten ligger Månen 30 jorddiametrar bort.',
        'The Sun always lights up exactly half of the Moon. Over a month we see different amounts of that bright half, depending on the angle α between the Sun and the Moon as seen from Earth: the lit fraction is (1 − cos α)/2. New moon to new moon takes 29.5 days, and from northern countries a waxing moon is lit on the right. Many people think the phases come from Earth\'s shadow, but the shadow always points away from the Sun and only reaches the Moon at full moon: then you get a lunar eclipse. The Moon\'s orbit is tilted by 5° (exaggerated to 18° here), so the full Moon usually passes above or below the shadow; switch on eclipse season to see an eclipse. The model is not to scale: in reality the Moon is 30 Earth-diameters away.',
      ),
      wow: L(
        'Vi ser alltid samma sida av Månen, eftersom den snurrar exakt ett varv runt sig själv medan den går ett varv runt Jorden.',
        'We always see the same side of the Moon, because it spins exactly once on its axis while going once around Earth.',
      ),
      controls: phases.controls,
    });

    ctx.addStation({
      id: 'space-gravity-well',
      title: L('Gravitationsbrunnen', 'The gravity well'),
      position: WELL_POS,
      viewpoint: { position: [-4.3, 2.05, 2.4], target: [-6.6, 0.75, 2.0] },
      intro: L(
        'En tratt som en rymdduk. Kan du få en kula att gå i omloppsbana?',
        'A funnel like a sheet of space. Can you get a marble into orbit?',
      ),
      howTo: L(
        'Dra på duken för att knuffa iväg en kula, eller prova knapparna. Jämför en knuff rakt in med en knuff åt sidan.',
        'Drag on the sheet to flick a marble, or try the buttons. Compare a push straight in with a push sideways.',
      ),
      science: L(
        'Tratten är formad som h ∝ −1/r, så lutningen och därmed dragningen mot mitten växer som 1/r², precis som gravitationen. Vi simulerar just en sådan kraft (för kulorna blir GM ≈ 0,30 m³/s²) plus friktion. En kula som knuffas rakt in faller rakt ner, men med fart åt sidan faller den hela tiden mot mitten och missar: det är en omloppsbana, och närmare mitten går den fortare, precis som Merkurius (47 km/s) går fortare än Jorden (30 km/s). Friktionen stjäl energi så kulorna spiralar in; i rymden bromsar nästan ingenting, så planeterna stannar kvar i miljarder år. Tratten är bara en 2D-bild av krökt rumtid: kulorna rullar för att Jordens tyngdkraft drar dem nedåt, och det är inte så gravitationen själv fungerar.',
        'The funnel is shaped like h ∝ −1/r, so its slope, and so the pull towards the centre, grows as 1/r², just like gravity. We simulate exactly that force (for the marbles GM ≈ 0.30 m³/s²) plus friction. A marble pushed straight in falls straight down, but with sideways speed it keeps falling towards the centre and keeps missing: that is an orbit, and closer in it moves faster, just as Mercury (47 km/s) moves faster than Earth (30 km/s). Friction steals energy so the marbles spiral in; in space almost nothing brakes, so planets stay put for billions of years. The funnel is only a 2D picture of curved spacetime: the marbles roll because Earth\'s gravity pulls them down, which is not how gravity itself works.',
      ),
      wow: L(
        'Med Merkurius fart, 47 km/s, skulle du ta dig från Stockholm till Göteborg på 10 sekunder.',
        'At Mercury\'s speed, 47 km/s, you could get from Stockholm to Gothenburg in 10 seconds.',
      ),
      controls: well.controls,
      onFocus: () => {
        wellFocused = true;
      },
      onBlur: () => {
        wellFocused = false;
      },
    });

    ctx.addStation({
      id: 'space-light-mail',
      title: L('Ljuspost', 'Light-speed mail'),
      position: MAIL_POS,
      viewpoint: { position: [5.3, 1.85, 0.5], target: [9.3, 1.4, 1.0] },
      intro: L(
        'Ljus är det snabbaste som finns, men rymden är enorm. Skicka ett ljusbrev och se hur lång tid det tar!',
        'Light is the fastest thing there is, but space is enormous. Send a light letter and see how long it takes!',
      ),
      howTo: L(
        'Tryck Skicka eller klicka på Solen. Klicka på en planet för att skicka post just dit, och välj hur mycket tiden snabbspolas.',
        'Press Send or click the Sun. Click a planet to send mail right there, and choose how much to speed up time.',
      ),
      science: L(
        'Ljus färdas 299 792 km varje sekund i vakuum, ungefär 7,5 varv runt Jorden. Ändå tar det 8 minuter och 19 sekunder från Solen till Jorden, och mer än 4 timmar till Neptunus, men bara 1,3 sekunder från Jorden till Månen. Därför ser vi alltid himlen som den var: Solen som den såg ut för 8 minuter sedan. Många tror att ljus kommer fram direkt, men det har en ändlig fart. Skenan är hoptryckt med en kvadratrotsskala så att alla planeter får plats, så pulsen ser ut att sakta in, men dess verkliga fart är hela tiden densamma: titta på klockan.',
        'Light travels 299,792 km every second in a vacuum, about 7.5 times around Earth. Even so it takes 8 minutes 19 seconds from the Sun to Earth and more than 4 hours to Neptune, but only 1.3 seconds from Earth to the Moon. So we always see the sky as it was: the Sun as it looked 8 minutes ago. Many people think light arrives instantly, but it has a finite speed. The rail is squeezed with a square-root scale so all the planets fit, which makes the pulse look as if it slows down, but its real speed is always the same: watch the clock.',
      ),
      wow: L(
        'Ett kommando till en marsbil tar mellan 3 och 22 minuter att komma fram, så den måste kunna klara sig själv.',
        'A command to a Mars rover takes between 3 and 22 minutes to arrive, so the rover has to look after itself.',
      ),
      controls: mail.controls,
    });

    return {
      update(dt, time) {
        decor.update(dt, time);
        orrery.update(dt, time);
        weight.update(dt);
        phases.update(dt, time);
        well.update(dt, time, wellFocused || near(WELL_POS[0], WELL_POS[1], 8));
        mail.update(dt, time);
      },
    };
  },
};
