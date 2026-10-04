// New York landmarks with real (approximate) positions and dates. Same format as src/landmarks.js.
import * as THREE from 'three';
import { GRID_ROT as G } from './geo.js';
import { WATER_Y } from '../../geo.js';

export const NYC_LANDMARKS = [
  { id: 'castleclinton', x: 17, z: -11, from: 1808, to: 9999, build: 3, label: () => 'Castle Clinton', major: true,
    make: k => { k.cyl(28, 9 - WATER_Y, 'stone', 0, WATER_Y, 0, 20); } },
  { id: 'fortjay', x: 150, z: 1300, rot: 0.3, from: 1795, to: 9999, build: 3, label: () => 'Fort Jay (Governors Island)',
    make: k => { k.cyl(70, 6, 'stone', 0, 0, 0, 5); k.box(60, 9, 40, 'brick', 0, 6, 0); } },
  { id: 'castlewilliams', x: -60, z: 1110, from: 1807, to: 9999, build: 4, label: () => 'Castle Williams',
    make: k => { k.cyl(32, 12 - WATER_Y, 'brick', 0, WATER_Y, 0, 18); } },
  { id: 'cityhall', x: 936, z: -1043, rot: G, from: 1803, to: 9999, build: 8, label: () => 'City Hall', major: true,
    make: k => { k.box(66, 16, 28, 'white'); k.box(30, 6, 22, 'white', 0, 16, 0); k.cyl(4, 12, 'white', 0, 22, 0, 12); k.mesh(new THREE.SphereGeometry(4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'copper', 0, 34, 0); } },
  { id: 'stpauls', x: 675, z: -899, rot: G, from: 1764, to: 9999, build: 2, label: () => "St. Paul's Chapel",
    make: k => { k.box(18, 14, 32, 'stone'); k.box(8, 26, 8, 'stone', 0, 0, 18); k.taper(7, 7, 1, 1, 30, 'stone', 0, 26, 18); } },
  { id: 'trinity', x: 405, z: -533, rot: G, from: 1839, to: 9999, build: 7, label: () => 'Trinity Church', major: true,
    make: k => { k.box(24, 20, 52, 'granite'); k.pyramid(26, 10, 'granite', 0, 20, 0, 54); k.box(11, 42, 11, 'granite', 0, 0, 30); k.taper(10, 10, 0.8, 0.8, 44, 'granite', 0, 42, 30); } },
  { id: 'liberty', x: -2316, z: 1568, rot: 0.6, from: 1884.5, to: 9999, build: 2.3, label: () => 'Statue of Liberty', major: true,
    make: k => {
      k.cyl(48, 9, 'stone', 0, 0, 0, 11);                                                     // Fort Wood's star-shaped walls
      k.taper(30, 30, 19, 19, 27, 'granite', 0, 9, 0);                                         // pedestal
      k.taper(9, 9, 6, 6, 5, 'granite', 0, 36, 0);
      k.cyl(5.5, 26, 'copper', 0, 41, 0, 10, 3.2);                                             // robed figure
      k.mesh(new THREE.SphereGeometry(3.4, 10, 8), 'copper', 0, 69.5, 0);                      // head
      k.mesh(new THREE.ConeGeometry(4.2, 2.5, 7).translate(0, 72.5, 0), 'copper');             // crown
      k.mesh(new THREE.BoxGeometry(1.8, 14, 1.8).translate(0, 7, 0).rotateZ(-0.18).translate(3.5, 64, 0), 'copper');   // raised arm
      k.mesh(new THREE.BoxGeometry(2.6, 4, 1.2).translate(-4.5, 58, 1.5), 'copper');          // tablet
      k.glow(new THREE.SphereGeometry(1.6, 10, 8).translate(5.8, 79, 0), 0xffd27a, 4, 0, 0, 0, 0xd8b45a);   // the torch
    } },
  { id: 'ellis', x: -1914, z: 430, rot: 0.2, from: 1898.5, to: 9999, build: 1.5, label: () => 'Ellis Island Immigration Station', major: true,
    make: k => { k.box(110, 22, 40, 'brick'); for (const [a, b] of [[-44, -16], [44, -16], [-44, 16], [44, 16]]) { k.box(8, 36, 8, 'brick', a, 0, b); k.mesh(new THREE.SphereGeometry(4.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'copper', a, 36, b); } } },
  { id: 'parkrow', x: 810, z: -944, rot: G, from: 1897, to: 9999, build: 2, label: () => 'Park Row Building',
    make: k => { k.box(32, 96, 44, 'stone'); for (const s of [-1, 1]) { k.cyl(5, 16, 'stone', 0, 96, s * 11, 10); k.mesh(new THREE.SphereGeometry(5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'copper', 0, 112, s * 11); } } },
  { id: 'singer', x: 548, z: -699, rot: G, from: 1906, to: 1968.3, build: 2, demo: 1.2, label: () => 'Singer Building', major: true,
    make: k => { k.box(55, 50, 42, 'brick'); k.box(20, 105, 20, 'brick', 0, 50, 0); k.mesh(new THREE.SphereGeometry(13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'copper', 0, 155, 0); k.cyl(3, 18, 'copper', 0, 165, 0, 8, 1); } },
  { id: 'libertyplaza', x: 548, z: -699, rot: G, from: 1971, to: 9999, build: 2.5, label: () => 'One Liberty Plaza',
    make: k => { k.box(70, 226, 46, 'mies'); } },
  { id: 'woolworth', x: 734, z: -1010, rot: G, from: 1910.3, to: 9999, build: 3, label: () => 'Woolworth Building', major: true,
    make: k => { k.box(60, 110, 46, 'white'); k.box(28, 95, 28, 'white', 0, 110, 0); k.taper(28, 28, 16, 16, 18, 'white', 0, 205, 0); k.pyramid(16, 16, 'copper', 0, 223, 0); k.cyl(0.8, 6, 'copper', 0, 239, 0, 6); } },
  { id: 'equitable', x: 523, z: -577, rot: G, from: 1913, to: 9999, build: 2, label: () => 'Equitable Building',
    make: k => { k.box(55, 164, 50, 'stone'); } },
  { id: 'wall40', x: 641, z: -400, rot: G, from: 1929.3, to: 9999, build: 1.3, label: () => '40 Wall Street', major: true,
    make: k => { k.box(46, 170, 40, 'stone'); k.box(36, 40, 32, 'stone', 0, 170, 0); k.box(26, 30, 24, 'stone', 0, 210, 0); k.pyramid(24, 28, 'copper', 0, 240, 0); k.cyl(0.8, 16, 'steel', 0, 267, 0, 6); } },
  { id: 'pine70', x: 784, z: -322, rot: G, from: 1930.5, to: 9999, build: 1.6, label: () => '70 Pine Street',
    make: k => { k.box(42, 150, 40, 'deco'); k.box(30, 60, 28, 'deco', 0, 150, 0); k.box(20, 40, 18, 'deco', 0, 210, 0); k.taper(15, 13, 3, 3, 32, 'deco', 0, 250, 0); k.cyl(0.6, 8, 'steel', 0, 282, 0, 6); } },
  { id: 'chase', x: 692, z: -566, rot: G, from: 1957.5, to: 9999, build: 3.5, label: () => 'One Chase Manhattan Plaza',
    make: k => { k.box(92, 248, 33, 'modern'); } },
  // Battery Park City: the World Financial Center (Brookfield Place)
  { id: 'wfc1', x: 125, z: -860, rot: G, from: 1983, to: 9999, build: 3, label: () => 'World Financial Center',
    make: k => { k.box(46, 150, 46, 'granite'); k.taper(46, 46, 20, 20, 16, 'granite', 0, 150, 0); k.taper(20, 20, 6, 6, 10, 'copper', 0, 166, 0); } },
  { id: 'wfc2', x: 150, z: -985, rot: G, from: 1984, to: 9999, build: 3,
    make: k => { k.box(48, 180, 48, 'granite'); k.mesh(new THREE.SphereGeometry(20, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'copper', 0, 180, 0); } },
  { id: 'wfc3', x: 130, z: -1120, rot: G, from: 1983, to: 9999, build: 2.5,
    make: k => { k.box(48, 200, 48, 'granite'); k.pyramid(30, 25, 'copper', 0, 200, 0); } },
  { id: 'wintergarden', x: 95, z: -1040, rot: G, from: 1986.5, to: 9999, build: 2,
    make: k => { k.mesh(new THREE.CylinderGeometry(18, 18, 60, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 12, 0), 'glass'); } },
  // Midtown, on the horizon
  { id: 'empire', x: 2640, z: -5006, rot: G, from: 1930.2, to: 9999, build: 1.2, label: () => 'Empire State Building', major: true,
    make: k => { k.box(130, 25, 58, 'stone'); k.box(82, 230, 46, 'stone', 0, 25, 0); k.box(54, 55, 36, 'stone', 0, 255, 0); k.box(32, 30, 26, 'stone', 0, 310, 0);
      k.cyl(8, 41, 'stone', 0, 340, 0, 8, 4); k.cyl(1, 62, 'steel', 0, 381, 0, 6);
      k.glow(new THREE.BoxGeometry(33, 28, 27).translate(0, 311, 0), 0xffffff, 0.5, 0, 0, 0, 0xb3a385); } },
  { id: 'chrysler', x: 3500, z: -5361, rot: G, from: 1928.8, to: 9999, build: 1.6, label: () => 'Chrysler Building', major: true,
    make: k => { k.box(60, 165, 60, 'stone'); k.box(42, 75, 42, 'stone', 0, 165, 0); for (let i = 0; i < 4; i++) k.taper(30 - i * 6, 30 - i * 6, 24 - i * 6, 24 - i * 6, 11, 'steel', 0, 240 + i * 11, 0); k.cyl(0.8, 35, 'steel', 0, 284, 0, 6);
      k.glow(new THREE.BoxGeometry(31, 40, 31).translate(0, 244, 0), 0xfff2d0, 0.6, 0, 0, 0, 0x9da3a8); } },
  { id: 'rock30', x: 3171, z: -6216, rot: G, from: 1931.5, to: 9999, build: 1.8, label: () => '30 Rockefeller Plaza',
    make: k => { k.taper(62, 30, 50, 24, 259, 'stone'); } },
  { id: 'vanderbilt', x: 3247, z: -5516, rot: G, from: 2017, to: 9999, build: 3.7, label: () => 'One Vanderbilt',
    make: k => { k.taper(56, 56, 24, 24, 395, 'glass'); k.cyl(1, 32, 'steel', 0, 395, 0, 6); } },
  { id: 'park432', x: 3803, z: -6471, rot: G, from: 2012, to: 9999, build: 3.9, label: () => '432 Park Avenue',
    make: k => { k.box(28, 426, 28, 'concrete'); } },
  { id: 'cpt', x: 3036, z: -7026, rot: G, from: 2015, to: 9999, build: 5, label: () => 'Central Park Tower',
    make: k => { k.box(36, 472, 30, 'glass'); } },
  { id: 'hy30', x: 1324, z: -5616, rot: G, from: 2016, to: 9999, build: 3.2, label: () => '30 Hudson Yards',
    make: k => { k.taper(56, 42, 40, 30, 387, 'glass'); k.box(24, 4, 30, 'steel', 0, 335, 26); } },
  // Brooklyn & Jersey City
  { id: 'wsbank', x: 3390, z: 1954, rot: -0.35, from: 1927.5, to: 9999, build: 1.7, label: () => 'Williamsburgh Savings Bank Tower',
    make: k => { k.box(40, 120, 40, 'stone'); k.box(22, 22, 22, 'stone', 0, 120, 0); k.mesh(new THREE.SphereGeometry(11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'copper', 0, 142, 0); } },
  { id: 'bktower', x: 2808, z: 1610, rot: -0.35, from: 2019, to: 9999, build: 3, label: () => 'The Brooklyn Tower',
    make: k => { k.taper(42, 42, 24, 24, 327, 'mies'); } },
  { id: 'goldman', x: -1520, z: -1380, from: 2001.5, to: 9999, build: 2.5, label: () => 'Goldman Sachs Tower (Jersey City)',
    make: k => { k.taper(52, 42, 44, 36, 238, 'glass'); } },
];
