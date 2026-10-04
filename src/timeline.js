// Eras, events and small year helpers shared by the scene and the UI.

export const START_YEAR = 1800;
export const END_YEAR = 2050;
export const PRESENT_YEAR = 2026;
export const FIRE_WINDOW = [1871.66, 1872.0];   // months are shown in the HUD inside this window

export const ERAS = [
  { from: 1800, to: 1833, name: 'Frontier & Fort', color: '#a0794a',
    text: 'Prairie, wetlands and Potawatomi camps around the Chicago portage. Fort Dearborn guards the river mouth, which still bends south behind a sandbar.' },
  { from: 1833, to: 1871, name: 'Boomtown', color: '#b8693a',
    text: 'The harbor is cut through the sandbar, and canal, railroads and grain turn a village into a city built of wood. Railroad trestles run out over the lake.' },
  { from: 1871, to: 1900, name: 'Fire & Rebirth', color: '#c94a2a',
    text: 'The Great Fire levels the center. Chicago rebuilds in brick, stone and steel and invents the skyscraper. Elevated trains circle the Loop.' },
  { from: 1900, to: 1930, name: 'City Beautiful', color: '#c9a03a',
    text: 'The river is reversed and the lakefront filled in to make Grant Park. The Burnham Plan, Navy Pier, the Michigan Avenue bridge and the first Art Deco towers.' },
  { from: 1930, to: 1955, name: 'Deco, Depression & War', color: '#8f8a5a',
    text: 'Construction stalls after the Board of Trade and Merchandise Mart. Outer Drive opens; streetcars and coal smoke still define the city.' },
  { from: 1955, to: 2000, name: 'Modern Metropolis', color: '#4a7aa8',
    text: 'Expressways, Mies-style glass boxes, Marina City, the Hancock and the Sears Tower, the world\'s tallest building for 25 years.' },
  { from: 2000, to: 2027, name: '21st-Century Chicago', color: '#3a9aa0',
    text: 'Millennium Park covers the rail yards. Riverwalk, Aqua, Trump Tower and the St. Regis arrive, with dense housing in the West and South Loop.' },
  { from: 2027, to: 2050.01, name: 'Sustainable Future', color: '#4ac08a', speculative: true,
    text: 'Speculative: vertical forests, green roofs, offshore wind, autonomous electric transit, a lakefront maglev and quiet air taxis, with the historic skyline kept.' },
];

// y = fractional year. `slow` marks moments worth slowing the playback for.
export const EVENTS = [
  { y: 1800, t: 'Potawatomi lands; Kinzie trading post on the north bank' },
  { y: 1803, t: 'Fort Dearborn built at the river mouth' },
  { y: 1812.6, t: 'Battle of Fort Dearborn; fort burned', slow: true },
  { y: 1816, t: 'Fort Dearborn rebuilt' },
  { y: 1833, t: 'Town incorporated; harbor cut through the sandbar; Treaty of Chicago', slow: true },
  { y: 1837, t: 'City of Chicago incorporated' },
  { y: 1848, t: 'Illinois & Michigan Canal and first railroad' },
  { y: 1852, t: 'Illinois Central trestle built out over the lake' },
  { y: 1856, t: 'Wharves, grain elevators and swing bridges line the river' },
  { y: 1859, t: 'Lighthouse at the end of the harbor pier' },
  { y: 1869, t: 'Water Tower completed' },
  { y: 1871.77, t: 'The Great Chicago Fire: 3.3 sq mi destroyed', slow: true, dur: 0.6 },
  { y: 1885, t: 'Home Insurance Building, the first steel-frame skyscraper' },
  { y: 1897, t: 'The elevated Union Loop opens' },
  { y: 1900, t: 'Chicago River reversed away from the lake', slow: true },
  { y: 1902, t: 'Chicago-type bascule bridges begin replacing swing bridges' },
  { y: 1909, t: 'Burnham Plan of Chicago' },
  { y: 1916, t: 'Municipal (Navy) Pier opens' },
  { y: 1919, t: 'Harbor lighthouse moved out to the new breakwater' },
  { y: 1920, t: 'Michigan Avenue bridge; Wrigley Building' },
  { y: 1925, t: 'Tribune Tower' },
  { y: 1926, t: 'Double-decked Wacker Drive replaces the South Water St market' },
  { y: 1927, t: 'Buckingham Fountain' },
  { y: 1930, t: 'Board of Trade and Merchandise Mart' },
  { y: 1937, t: 'Outer Drive bridge completes Lake Shore Drive' },
  { y: 1955, t: 'Prudential Building ends the 25-year building drought' },
  { y: 1958, t: 'Expressways carve through the West Side' },
  { y: 1964, t: 'Marina City' },
  { y: 1969, t: 'John Hancock Center' },
  { y: 1973, t: 'Sears Tower becomes the world\'s tallest building', slow: true },
  { y: 1995, t: 'Navy Pier renovated; Ferris wheel' },
  { y: 2004, t: 'Millennium Park opens over the rail yards', slow: true },
  { y: 2009, t: 'Sears Tower renamed Willis Tower; Trump Tower and Aqua' },
  { y: 2009, t: 'Riverwalk construction begins below Wacker Drive' },
  { y: 2016, t: 'Chicago Riverwalk completed' },
  { y: 2020, t: 'St. Regis Chicago tops out' },
  { y: 2026, t: 'Present day', slow: true },
  { y: 2032, t: 'Speculative: autonomous electric pods replace most cars' },
  { y: 2038, t: 'Speculative: offshore wind farms on Lake Michigan' },
  { y: 2044, t: 'Speculative: lakefront maglev and electric air taxis' },
  { y: 2050, t: 'Speculative: vertical-forest towers, citywide green roofs' },
];

export function eraAt(year) {
  for (const e of ERAS) if (year >= e.from && year < e.to) return e;
  return ERAS[ERAS.length - 1];
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
// 0 → 1 between y0 and y1
export const ramp = (year, y0, y1) => smoothstep(y0, y1, year);
// 1 inside [y0, y1] with soft edges of width f
export const window01 = (year, y0, y1, f = 3) => smoothstep(y0 - f, y0, year) * (1 - smoothstep(y1, y1 + f, year));

// "1871" or "Oct 1871" style label for fractional years
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthOf(year) {
  return MONTHS[clamp(Math.floor((year - Math.floor(year)) * 12), 0, 11)];
}
