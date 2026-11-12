/** Shared discipline IDs: existing IDs remain stable for stored competitions and imports. */
export const sportCatalog = [
  { id: 'football', name: 'Calcio a 11', group: 'Calcio e varianti', detailedResults: true },
  { id: 'futsal', name: 'Calcio a 5 (Futsal)', group: 'Calcio e varianti', detailedResults: false },
  { id: 'beach_soccer', name: 'Beach Soccer', group: 'Calcio e varianti', detailedResults: false },
  { id: 'football_7', name: 'Calcio a 7', group: 'Calcio e varianti', detailedResults: false },
  { id: 'football_8', name: 'Calcio a 8', group: 'Calcio e varianti', detailedResults: false },
  {
    id: 'basketball',
    name: 'Pallacanestro (Basket)',
    group: 'Pallacanestro e varianti',
    detailedResults: true,
  },
  {
    id: 'basketball_3x3',
    name: 'Basket 3x3',
    group: 'Pallacanestro e varianti',
    detailedResults: false,
  },
  {
    id: 'wheelchair_basketball',
    name: 'Basket in carrozzina',
    group: 'Pallacanestro e varianti',
    detailedResults: false,
  },
  { id: 'volleyball', name: 'Pallavolo', group: 'Pallavolo e varianti', detailedResults: true },
  {
    id: 'beach_volleyball',
    name: 'Beach Volley',
    group: 'Pallavolo e varianti',
    detailedResults: false,
  },
  {
    id: 'sitting_volleyball',
    name: 'Sitting Volley',
    group: 'Pallavolo e varianti',
    detailedResults: false,
  },
  { id: 'rugby_union', name: 'Rugby a 15', group: 'Rugby', detailedResults: false },
  { id: 'rugby_sevens', name: 'Rugby a 7', group: 'Rugby', detailedResults: false },
  { id: 'rugby_league', name: 'Rugby a 13 (League)', group: 'Rugby', detailedResults: false },
  {
    id: 'rink_hockey',
    name: 'Hockey su pista',
    group: 'Sport rotellistici e su ghiaccio',
    detailedResults: false,
  },
  {
    id: 'inline_hockey',
    name: 'Hockey in line',
    group: 'Sport rotellistici e su ghiaccio',
    detailedResults: false,
  },
  {
    id: 'ice_hockey',
    name: 'Hockey su ghiaccio',
    group: 'Sport rotellistici e su ghiaccio',
    detailedResults: false,
  },
  {
    id: 'roller_derby',
    name: 'Roller Derby',
    group: 'Sport rotellistici e su ghiaccio',
    detailedResults: false,
  },
  {
    id: 'field_hockey',
    name: 'Hockey su prato',
    group: 'Hockey e Lacrosse',
    detailedResults: false,
  },
  {
    id: 'indoor_hockey',
    name: 'Hockey indoor',
    group: 'Hockey e Lacrosse',
    detailedResults: false,
  },
  { id: 'lacrosse', name: 'Lacrosse', group: 'Hockey e Lacrosse', detailedResults: false },
  { id: 'floorball', name: 'Floorball', group: 'Hockey e Lacrosse', detailedResults: false },
  {
    id: 'handball',
    name: 'Pallamano (Handball)',
    group: 'Pallamano e sport acquatici di squadra',
    detailedResults: false,
  },
  {
    id: 'beach_handball',
    name: 'Beach Handball',
    group: 'Pallamano e sport acquatici di squadra',
    detailedResults: false,
  },
  {
    id: 'water_polo',
    name: 'Pallanuoto',
    group: 'Pallamano e sport acquatici di squadra',
    detailedResults: false,
  },
  {
    id: 'underwater_hockey',
    name: 'Hockey subacqueo',
    group: 'Pallamano e sport acquatici di squadra',
    detailedResults: false,
  },
  {
    id: 'underwater_rugby',
    name: 'Rugby subacqueo',
    group: 'Pallamano e sport acquatici di squadra',
    detailedResults: false,
  },
  { id: 'baseball', name: 'Baseball', group: 'Mazza e palla', detailedResults: false },
  { id: 'softball', name: 'Softball', group: 'Mazza e palla', detailedResults: false },
  { id: 'cricket', name: 'Cricket', group: 'Mazza e palla', detailedResults: false },
  {
    id: 'american_football',
    name: 'Tackle Football (Football americano)',
    group: 'Football americano',
    detailedResults: false,
  },
  {
    id: 'flag_football',
    name: 'Flag Football',
    group: 'Football americano',
    detailedResults: false,
  },
  { id: 'tchoukball', name: 'Tchoukball', group: 'Altri sport di squadra', detailedResults: false },
  { id: 'fistball', name: 'Fistball', group: 'Altri sport di squadra', detailedResults: false },
  { id: 'dodgeball', name: 'Dodgeball', group: 'Altri sport di squadra', detailedResults: false },
  {
    id: 'quadball',
    name: 'Quadball (già Quidditch)',
    group: 'Altri sport di squadra',
    detailedResults: false,
  },
] as const;
export type SportId = (typeof sportCatalog)[number]['id'];
export function isSportId(value: string): value is SportId {
  return sportCatalog.some((sport) => sport.id === value);
}
export type DetailedSportId = Extract<
  (typeof sportCatalog)[number],
  { detailedResults: true }
>['id'];
export function hasDetailedResults(value: string): value is DetailedSportId {
  return sportCatalog.some((sport) => sport.id === value && sport.detailedResults);
}
