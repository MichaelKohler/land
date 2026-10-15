// Who lives on the island: one house each, in this order around the plaza. Konstantina and Alice show only their
// name (nameOnly); Michael's entry has his places on the web and how he got here.
//   color   their house's roof, shutters, door and mailbox
//   garden  the garden around their house: "kitchen", "mediterranean" or "family" (see island/gardens.js)
//   bicycle a bicycle in their colour parked by the porch steps
window.RESIDENTS = [
  {
    id: "konstantina",
    name: "Konstantina",
    short: "Konstantina",
    color: "#b0524a",
    garden: "mediterranean",
    bicycle: true,
    nameOnly: true,
    links: [],
    path: [],
  },
  {
    id: "michael",
    name: "Michael Kohler",
    short: "Michael",
    role: "Software Engineer",
    org: "Interledger Foundation",
    home: "Berlin",
    color: "#23395b",
    garden: "kitchen",
    links: [
      { kind: "cv", label: "CV", sub: "mkohler.dev", url: "https://mkohler.dev" },
      { kind: "code", label: "GitHub", sub: "@michaelkohler", url: "https://github.com/michaelkohler" },
      {
        kind: "tv",
        label: "TV Tracker",
        sub: "tv.michaelkohler.info",
        url: "https://tv.michaelkohler.info",
        src: "https://github.com/michaelkohler/tv-tracker",
      },
      {
        kind: "trips",
        label: "Trips",
        sub: "password protected",
        url: "https://where.michaelkohler.info",
        locked: true,
      },
    ],
    path: [
      { year: "origin", place: "Bern", text: "Bern, Switzerland — where the journey began" },
      { year: "2008", place: "Mozilla", text: "Mozilla volunteer since 2008, ongoing — Mozilla Rep & Common Voice" },
      { year: "2010", place: "Swisscom", text: "Swisscom Banking, 2010–2015 — core banking & document platforms" },
      { year: "2016", place: "NEEO", text: "Control4 / NEEO, 2016–2020 — smart-home hubs & Z-Wave integrations" },
      { year: "2021", place: "Klarna", text: "Klarna, 2021–2026 — Lead Engineer, Card & Banking" },
      { year: "now", place: "Interledger", text: "Interledger Foundation, Berlin — where I am now" },
    ],
  },
  {
    id: "alice",
    name: "Alice",
    short: "Alice",
    color: "#5f8a6c",
    garden: "family",
    nameOnly: true,
    links: [],
    path: [],
  },
];
