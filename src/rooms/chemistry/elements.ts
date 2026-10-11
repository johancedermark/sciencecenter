/** Elements 1–36: standard atomic weights (IUPAC, rounded), groups and a fact each. */
import type { L10n } from '../../core/types';

export type Category =
  | 'alkali' | 'alkaline' | 'transition' | 'post' | 'metalloid' | 'nonmetal' | 'halogen' | 'noble';

export interface Element {
  z: number;
  sym: string;
  name: L10n;
  mass: number;
  period: number;
  group: number;
  cat: Category;
  fact: L10n;
}

export const CATEGORY: Record<Category, { color: string; name: L10n }> = {
  alkali: { color: '#ff8a65', name: { sv: 'Alkalimetaller', en: 'Alkali metals' } },
  alkaline: { color: '#ffc46b', name: { sv: 'Alkaliska jordartsmetaller', en: 'Alkaline earth metals' } },
  transition: { color: '#f2a7c3', name: { sv: 'Övergångsmetaller', en: 'Transition metals' } },
  post: { color: '#b9c7d8', name: { sv: 'Övriga metaller', en: 'Other metals' } },
  metalloid: { color: '#a8d8a0', name: { sv: 'Halvmetaller', en: 'Metalloids' } },
  nonmetal: { color: '#8fdcf0', name: { sv: 'Icke-metaller', en: 'Nonmetals' } },
  halogen: { color: '#d8e87a', name: { sv: 'Halogener', en: 'Halogens' } },
  noble: { color: '#c7a8f5', name: { sv: 'Ädelgaser', en: 'Noble gases' } },
};

const E = (
  z: number, sym: string, sv: string, en: string, mass: number, period: number, group: number, cat: Category,
  fsv: string, fen: string,
): Element => ({ z, sym, name: { sv, en }, mass, period, group, cat, fact: { sv: fsv, en: fen } });

export const ELEMENTS: Element[] = [
  E(1, 'H', 'Väte', 'Hydrogen', 1.008, 1, 1, 'nonmetal',
    'Det vanligaste grundämnet i universum: ungefär tre fjärdedelar av all vanlig materia. Solen lyser genom att smälta ihop väte till helium.',
    'The most common element in the universe: about three quarters of all ordinary matter. The Sun shines by fusing hydrogen into helium.'),
  E(2, 'He', 'Helium', 'Helium', 4.003, 1, 18, 'noble',
    'Upptäcktes i solens spektrum 1868, innan någon hittat det på jorden. Namnet kommer från grekiskans helios, sol.',
    'Discovered in the Sun\'s spectrum in 1868, before anyone found it on Earth. The name comes from the Greek helios, sun.'),
  E(3, 'Li', 'Litium', 'Lithium', 6.94, 2, 1, 'alkali',
    'Den lättaste metallen: den flyter på vatten. Finns i batteriet i din mobil och ger en karminröd låga.',
    'The lightest metal: it floats on water. It is in your phone battery and gives a crimson flame.'),
  E(4, 'Be', 'Beryllium', 'Beryllium', 9.012, 2, 2, 'alkaline',
    'Speglarna i rymdteleskopet James Webb är gjorda av beryllium med ett tunt lager guld.',
    'The mirrors of the James Webb Space Telescope are made of beryllium with a thin coat of gold.'),
  E(5, 'B', 'Bor', 'Boron', 10.81, 2, 13, 'metalloid',
    'Borosilikatglas tål snabba temperaturskiften, så det används till laboratorieglas, som bägarna här i labbet.',
    'Borosilicate glass survives sudden temperature changes, so it is used for lab glassware like the beakers in this lab.'),
  E(6, 'C', 'Kol', 'Carbon', 12.011, 2, 14, 'nonmetal',
    'Diamant och grafit (blyerts) är båda rent kol, bara olika ordnade. Allt liv på jorden bygger på kolföreningar.',
    'Diamond and graphite (pencil lead) are both pure carbon, just arranged differently. All life on Earth is built on carbon compounds.'),
  E(7, 'N', 'Kväve', 'Nitrogen', 14.007, 2, 15, 'nonmetal',
    '78 % av luften du andas är kvävgas, N₂. Flytande kväve är −196 °C kallt.',
    '78% of the air you breathe is nitrogen gas, N₂. Liquid nitrogen is −196 °C cold.'),
  E(8, 'O', 'Syre', 'Oxygen', 15.999, 2, 16, 'nonmetal',
    'Ungefär 21 % av luften och cirka 65 % av din kroppsvikt (mest i vattnet i dig).',
    'About 21% of the air and roughly 65% of your body mass (mostly in the water inside you).'),
  E(9, 'F', 'Fluor', 'Fluorine', 18.998, 2, 17, 'halogen',
    'Det mest reaktiva grundämnet av alla. Fluorid i tandkräm gör tandemaljen starkare.',
    'The most reactive element of all. Fluoride in toothpaste makes tooth enamel stronger.'),
  E(10, 'Ne', 'Neon', 'Neon', 20.180, 2, 18, 'noble',
    'Lyser röd-orange när ström går genom gasen. Bara de rödorange skyltarna innehåller egentligen neon.',
    'Glows red-orange when electricity passes through it. Only the red-orange signs actually contain neon.'),
  E(11, 'Na', 'Natrium', 'Sodium', 22.990, 3, 1, 'alkali',
    'En mjuk metall du kan skära med kniv. Tillsammans med klor blir den koksalt, NaCl. Ger en gul låga.',
    'A soft metal you can cut with a knife. Together with chlorine it becomes table salt, NaCl. Gives a yellow flame.'),
  E(12, 'Mg', 'Magnesium', 'Magnesium', 24.305, 3, 2, 'alkaline',
    'Brinner med bländande vitt ljus, därför finns det i nödbloss och fyrverkerier. Klorofyll har en magnesiumatom i mitten.',
    'Burns with a dazzling white light, so it is used in flares and fireworks. Chlorophyll has a magnesium atom at its centre.'),
  E(13, 'Al', 'Aluminium', 'Aluminium', 26.982, 3, 13, 'post',
    'Den vanligaste metallen i jordskorpan. En aluminiumburk kan återvinnas om och om igen.',
    'The most common metal in Earth\'s crust. An aluminium can can be recycled again and again.'),
  E(14, 'Si', 'Kisel', 'Silicon', 28.085, 3, 14, 'metalloid',
    'Datorchip och solceller är gjorda av kisel. Sand är mest kiseldioxid, SiO₂.',
    'Computer chips and solar cells are made of silicon. Sand is mostly silicon dioxide, SiO₂.'),
  E(15, 'P', 'Fosfor', 'Phosphorus', 30.974, 3, 15, 'nonmetal',
    'Vit fosfor lyser svagt i mörker när den reagerar med luft. Fosfor finns i ditt DNA och i dina ben.',
    'White phosphorus glows faintly in the dark as it reacts with air. Phosphorus is in your DNA and your bones.'),
  E(16, 'S', 'Svavel', 'Sulfur', 32.06, 3, 16, 'nonmetal',
    'Ett gult ämne som finns runt vulkaner. Svavelväte, H₂S, är det som luktar ruttna ägg.',
    'A yellow substance found around volcanoes. Hydrogen sulfide, H₂S, is what smells like rotten eggs.'),
  E(17, 'Cl', 'Klor', 'Chlorine', 35.45, 3, 17, 'halogen',
    'En giftig grön gas som grundämne, men i koksalt är den helt ofarlig. Klor håller badvatten rent.',
    'A poisonous green gas as an element, but harmless in table salt. Chlorine keeps swimming pools clean.'),
  E(18, 'Ar', 'Argon', 'Argon', 39.95, 3, 18, 'noble',
    'Nästan 1 % av luften är argon. Partikellådan här i labbet låtsas vara argonatomer.',
    'Almost 1% of air is argon. The particle box here in the lab pretends to be argon atoms.'),
  E(19, 'K', 'Kalium', 'Potassium', 39.098, 4, 1, 'alkali',
    'Bananer är rika på kalium. Metallen reagerar våldsamt med vatten och brinner med lila låga.',
    'Bananas are rich in potassium. The metal reacts violently with water and burns with a lilac flame.'),
  E(20, 'Ca', 'Kalcium', 'Calcium', 40.078, 4, 2, 'alkaline',
    'Dina ben och tänder, äggskal och kalksten är fulla av kalcium. Ger en tegelröd låga.',
    'Your bones and teeth, eggshells and limestone are full of calcium. Gives a brick-red flame.'),
  E(21, 'Sc', 'Skandium', 'Scandium', 44.956, 4, 3, 'transition',
    'Upptäcktes i Sverige 1879 av Lars Fredrik Nilson och fick namn efter Skandinavien.',
    'Discovered in Sweden in 1879 by Lars Fredrik Nilson and named after Scandinavia.'),
  E(22, 'Ti', 'Titan', 'Titanium', 47.867, 4, 4, 'transition',
    'Stark som stål men nästan hälften så tung. Används i flygplan och i skruvar som opereras in i skelettet.',
    'As strong as steel but almost half the weight. Used in aircraft and in screws implanted in bones.'),
  E(23, 'V', 'Vanadin', 'Vanadium', 50.942, 4, 5, 'transition',
    'Namngavs efter den nordiska gudinnan Vanadis (Freja). Gör stål segt, till exempel i skiftnycklar.',
    'Named after the Norse goddess Vanadís (Freyja). Makes steel tough, for example in spanners.'),
  E(24, 'Cr', 'Krom', 'Chromium', 51.996, 4, 6, 'transition',
    'Gör rostfritt stål rostfritt. Rubiner är röda på grund av lite krom.',
    'Makes stainless steel stainless. Rubies are red because of a little chromium.'),
  E(25, 'Mn', 'Mangan', 'Manganese', 54.938, 4, 7, 'transition',
    'Behövs i nästan allt stål. Växter använder mangan när de delar vatten i fotosyntesen.',
    'Needed in almost all steel. Plants use manganese to split water during photosynthesis.'),
  E(26, 'Fe', 'Järn', 'Iron', 55.845, 4, 8, 'transition',
    'Jordens kärna är mest järn. Hemoglobinet i ditt blod bär syre med hjälp av järnatomer.',
    'Earth\'s core is mostly iron. The haemoglobin in your blood carries oxygen using iron atoms.'),
  E(27, 'Co', 'Kobolt', 'Cobalt', 58.933, 4, 9, 'transition',
    'Ger koboltblått glas. Ett sådant glas filtrerar bort natriums gula ljus i flamtestet. Upptäcktes i Sverige av Georg Brandt.',
    'Gives cobalt-blue glass, which filters out sodium\'s yellow light in flame tests. Discovered in Sweden by Georg Brandt.'),
  E(28, 'Ni', 'Nickel', 'Nickel', 58.693, 4, 10, 'transition',
    'Jordens kärna innehåller nickel tillsammans med järn. Isolerades första gången av svensken Axel Fredrik Cronstedt 1751.',
    'Earth\'s core contains nickel along with iron. First isolated by the Swede Axel Fredrik Cronstedt in 1751.'),
  E(29, 'Cu', 'Koppar', 'Copper', 63.546, 4, 11, 'transition',
    'Leder ström nästan bäst av alla metaller, därför finns den i elsladdar. Ger en blågrön låga.',
    'Conducts electricity almost better than any other metal, so it is in electric wires. Gives a blue-green flame.'),
  E(30, 'Zn', 'Zink', 'Zinc', 65.38, 4, 12, 'transition',
    'Ett tunt zinklager skyddar stål från rost (galvanisering). Din kropp behöver zink för immunförsvaret.',
    'A thin zinc coat protects steel from rust (galvanising). Your body needs zinc for its immune system.'),
  E(31, 'Ga', 'Gallium', 'Gallium', 69.723, 4, 13, 'post',
    'Smälter vid 29,8 °C, alltså i en varm hand. Galliumnitrid finns i blå lysdioder.',
    'Melts at 29.8 °C, so it melts in a warm hand. Gallium nitride is in blue LEDs.'),
  E(32, 'Ge', 'Germanium', 'Germanium', 72.630, 4, 14, 'metalloid',
    'De första transistorerna (1947) gjordes av germanium. Mendelejev förutsade ämnet innan det upptäcktes.',
    'The first transistors (1947) were made of germanium. Mendeleev predicted it before it was discovered.'),
  E(33, 'As', 'Arsenik', 'Arsenic', 74.922, 4, 15, 'metalloid',
    'Ökänt gift, men galliumarsenid används i lysdioder och snabba elektronikchip.',
    'A notorious poison, but gallium arsenide is used in LEDs and fast electronic chips.'),
  E(34, 'Se', 'Selen', 'Selenium', 78.971, 4, 16, 'nonmetal',
    'Upptäcktes av svensken Jöns Jacob Berzelius 1817. Leder ström bättre i ljus, och kroppen behöver lite selen.',
    'Discovered by the Swede Jöns Jacob Berzelius in 1817. Conducts better in light, and your body needs a little.'),
  E(35, 'Br', 'Brom', 'Bromine', 79.904, 4, 17, 'halogen',
    'Ett av bara två grundämnen som är flytande i rumstemperatur. Det andra är kvicksilver.',
    'One of only two elements that are liquid at room temperature. The other is mercury.'),
  E(36, 'Kr', 'Krypton', 'Krypton', 83.798, 4, 18, 'noble',
    'Stålmannens hemplanet heter Krypton, men på riktigt är krypton en ädelgas som används i blixtlampor.',
    'Superman\'s home planet is called Krypton, but the real krypton is a noble gas used in photo flash lamps.'),
];

/** Electrons per shell (n = 1, 2, 3, 4) from the real ground-state configuration. */
export function shells(z: number): number[] {
  // Filling order with the Cr and Cu exceptions (3d⁵4s¹ and 3d¹⁰4s¹).
  const order: [number, number][] = [[1, 2], [2, 2], [2, 6], [3, 2], [3, 6], [4, 2], [3, 10], [4, 6]];
  const s = [0, 0, 0, 0];
  let left = z;
  for (const [n, cap] of order) {
    const k = Math.min(cap, left);
    s[n - 1] += k;
    left -= k;
    if (!left) break;
  }
  if (z === 24 || z === 29) {
    s[2] += 1;
    s[3] -= 1;
  }
  return s.filter((v, i) => v > 0 || i === 0);
}
