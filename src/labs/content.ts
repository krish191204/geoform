/**
 * Copy for each lab: title, the physics in one breath, what you should notice.
 * Keep this in sync with the demos in elevation.ts, rivers.ts, etc.
 */
export type LabId = 'elevation' | 'rivers' | 'rain' | 'tectonics' | 'settle' | 'continents'

export interface LabMeta {
  id: LabId
  num: string
  title: string
  tagline: string
  physics: string
  teaches: string[]
}

export const LABS: LabMeta[] = [
  {
    id: 'elevation',
    num: '01',
    title: 'Elevation → climate',
    tagline: 'Air cools as it rises. Height decides snow, frost, and growing season.',
    physics:
      'Environmental lapse rate ≈ 6.5 °C per km. Raise a ridge and the summit drops below freezing while the valley stays mild — same latitude, different world.',
    teaches: [
      'Temperature falls with height (lapse rate)',
      'Snow line is a contour of 0 °C, not a texture',
      'Brushing height is brushing climate potential',
    ],
  },
  {
    id: 'rivers',
    num: '02',
    title: 'Rivers from height',
    tagline: 'Water is lazy. It always seeks lower ground and carves where flow gathers.',
    physics:
      'Each cell drains to its lowest neighbor (D8). Flow accumulation counts how many upstream cells contribute — thick rivers are confluence, not decoration.',
    teaches: [
      'Flow direction follows the steepest descent',
      'Rivers emerge where accumulation exceeds a threshold',
      'Raise a ridge and drainage divides; dig a valley and water finds it',
    ],
  },
  {
    id: 'rain',
    num: '03',
    title: 'Rain shadow',
    tagline: 'Moist air climbs, rains, then descends dry. Mountains mint deserts.',
    physics:
      'Orographic lift: windward air cools and drops moisture; leeward air warms and stays arid. Stronger wind + taller ridge = sharper shadow.',
    teaches: [
      'Windward wet / leeward dry is asymmetric',
      'Ridge height and wind strength control the contrast',
      'This is what Earth climate data teaches a world generator',
    ],
  },
  {
    id: 'tectonics',
    num: '04',
    title: 'Plate edges',
    tagline: 'Continents don’t float still. Boundaries build mountains, rifts, and offsets.',
    physics:
      'Convergent plates thicken crust into ranges. Divergent plates pull apart into rifts and new low crust. Transform faults slide past — rivers get kinked, not raised.',
    teaches: [
      'Converge → uplift and folded highlands',
      'Diverge → rift valley / new ocean floor',
      'Transform → lateral offset without big elevation gain',
    ],
  },
  {
    id: 'settle',
    num: '05',
    title: 'Where cities want to be',
    tagline: 'People stack on gentle slopes near water, not on ice or sheer ridges.',
    physics:
      'Suitability blends three signals: access to accumulated flow (water), low slope (buildable), and mild temperature from elevation. Change the land and the heatmap moves.',
    teaches: [
      'Water access pulls settlement toward rivers and coasts',
      'Steep slopes and cold summits repel',
      'City placement is a consequence of geography, not a sticker pack',
    ],
  },
  {
    id: 'continents',
    num: '06',
    title: 'Full continents',
    tagline: 'A wet planet still has continents — not a hundred green specks.',
    physics:
      'Land/water mix sets how much crust sits above the sea. Continent mode keeps the largest 2–3 masses and grows their coasts; island mode is the speckle look, on purpose.',
    teaches: [
      'Full continents ≠ more land; it is how land clumps',
      'Raising water shrinks coasts, it should not shatter continents into peaks',
      'The map editor uses this same generator and silently repairs speckles',
    ],
  },
]
