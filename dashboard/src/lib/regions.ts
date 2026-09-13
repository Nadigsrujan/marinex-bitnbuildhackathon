import type { Coordinate, DashboardState } from "./types";

export interface MaritimeRegion {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  center: Coordinate;
  coordsText: string;
  depthText: string;
  camera: [number, number, number];
  threatCamera: [number, number, number];
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  origin: Coordinate;
  destination: Coordinate;
  focusVessel: string;
  summary: string;
}

export const MARITIME_REGIONS: MaritimeRegion[] = [
  {
    id: "galapagos",
    name: "Galapagos Sanctuary",
    subtitle: "UNESCO Marine Protected Area & Pelagic Corridor",
    category: "MARINE SANCTUARY",
    center: [-90.5, -0.5],
    coordsText: "0.829° S, 90.982° W",
    depthText: "2,840m (Trench & Seamounts)",
    camera: [-90.5, -0.5, 650000],
    threatCamera: [-90.85, -0.22, 420000],
    bbox: [-93.0, -3.5, -87.0, 2.5],
    origin: [-88.5, 1.2],
    destination: [-91.5, -1.8],
    focusVessel: "FU YUAN YU 882",
    summary: "High-risk IUU distant-water fishing buffer zone; Cromwell undercurrent advection.",
  },
  {
    id: "malacca",
    name: "Malacca Strait",
    subtitle: "Singapore & Global Maritime Shipping Chokepoint",
    category: "GLOBAL CHOKEPOINT",
    center: [102.5, 2.5],
    coordsText: "2.500° N, 102.500° E",
    depthText: "85m (High-Density TSS Channel)",
    camera: [102.5, 2.5, 520000],
    threatCamera: [103.8, 1.25, 250000],
    bbox: [98.5, 0.5, 105.5, 5.5],
    origin: [99.8, 4.2],
    destination: [104.2, 1.3],
    focusVessel: "EVER GIVEN 02",
    summary: "Busiest container shipping lane globally; high collision risk and traffic separation compliance.",
  },
  {
    id: "hormuz",
    name: "Strait of Hormuz",
    subtitle: "Persian Gulf Energy & Tanker Transit Corridor",
    category: "ENERGY TRANSIT",
    center: [56.3, 26.3],
    coordsText: "26.300° N, 56.300° E",
    depthText: "120m (Restricted Deep Channel)",
    camera: [56.3, 26.3, 480000],
    threatCamera: [56.4, 26.5, 220000],
    bbox: [54.0, 24.5, 58.5, 28.0],
    origin: [54.8, 25.4],
    destination: [57.8, 25.8],
    focusVessel: "AL DAFNA CRUDE",
    summary: "Strategic global oil passage; electronic interference & dark spoofing surveillance.",
  },
  {
    id: "panama",
    name: "Panama Canal Approaches",
    subtitle: "Pacific / Caribbean Gateway Convergence",
    category: "CANAL APPROACH",
    center: [-79.5, 8.8],
    coordsText: "8.800° N, 79.500° W",
    depthText: "65m (Gulf of Panama Anchorage)",
    camera: [-79.5, 8.8, 450000],
    threatCamera: [-79.55, 8.92, 180000],
    bbox: [-81.5, 7.0, -78.0, 10.5],
    origin: [-80.8, 7.5],
    destination: [-79.5, 8.9],
    focusVessel: "PACIFIC VALIANT",
    summary: "Major trans-oceanic hub; waiting queue optimization and ballast water environmental monitoring.",
  },
  {
    id: "redsea",
    name: "Red Sea & Bab-el-Mandeb",
    subtitle: "High-Risk Maritime Transit & Security Corridor",
    category: "SECURITY CORRIDOR",
    center: [43.3, 12.8],
    coordsText: "12.800° N, 43.300° E",
    depthText: "1,400m (Volcanic Rift Trench)",
    camera: [43.3, 12.8, 550000],
    threatCamera: [43.4, 12.6, 250000],
    bbox: [41.5, 11.5, 45.0, 15.0],
    origin: [42.2, 14.2],
    destination: [44.5, 12.1],
    focusVessel: "MARAN GAS CORONIS",
    summary: "Critical security choke point; active dynamic rerouting around asymmetric threat zones.",
  },
  {
    id: "barrier_reef",
    name: "Great Barrier Reef",
    subtitle: "UNESCO Coral Sea Marine Protected Park",
    category: "CORAL BIO-RESERVE",
    center: [147.5, -18.2],
    coordsText: "18.200° S, 147.500° E",
    depthText: "1,150m (Reef Shelf Drop)",
    camera: [147.5, -18.2, 600000],
    threatCamera: [146.8, -17.5, 280000],
    bbox: [144.0, -22.0, 152.0, -14.0],
    origin: [145.2, -15.5],
    destination: [149.8, -20.2],
    focusVessel: "CORAL SURVEYOR IV",
    summary: "Strict ecological speed limits, grounding avoidance, and autonomous USV coral reef monitoring.",
  },
];
