const APP_VERSION = "1.0";

// Prioritätsstufen. Die Frist bleibt das führende Ordnungsmerkmal — die Priorität
// entscheidet nur bei gleichem Datum, welche Aufgabe oben steht.
const PRIORITAETEN = [
  { id: "hoch",    label: "Hoch",    farbe: "#c0392b", rang: 0 },
  { id: "normal",  label: "Normal",  farbe: "#7f8c8d", rang: 1 },
  { id: "niedrig", label: "Niedrig", farbe: "#95a5a6", rang: 2 }
];

// Status einer Aufgabe. "ueberfaellig" steht bewusst NICHT hier: das ist kein
// gespeicherter Zustand, sondern wird bei jeder Anzeige aus Frist + Status
// gerechnet (istUeberfaellig() in app.js). Ein gespeicherter Überfällig-Status
// bräuchte einen nächtlichen Lauf, der Datensätze umschreibt.
const STATUS_WERTE = [
  { id: "offen",           label: "Offen",             farbe: "#2c6fbb" },
  { id: "gemeldet",        label: "Zur Abnahme",       farbe: "#d68910" },
  { id: "erledigt",        label: "Erledigt",          farbe: "#1e8449" },
  { id: "abgelehnt",       label: "Abgelehnt",         farbe: "#922b21" },
  { id: "zurueckgezogen",  label: "Zurückgezogen",     farbe: "#7f8c8d" }
];

// Ein abgeschlossener Vorgang ist einer, bei dem nichts mehr zu tun ist. Nur diese
// Status wandern in der Personenübersicht aus der Spalte "offen" heraus.
const STATUS_ABGESCHLOSSEN = ["erledigt", "abgelehnt", "zurueckgezogen"];

const MAX_ANHANG_MB = 8;

const APP_CHANGELOG = [
  {
    version: "1.0",
    groups: [
      {
        title: "Aufgaben mit Frist",
        items: [
          "Aufgaben werden einer Person oder einem Ressort zugewiesen — mit Pflicht-Frist, Priorität, Beschreibung und wahlweise einem Anhang.",
          "An ein Ressort zugewiesen heißt: der Verantwortliche erledigt, die Mitglieder sehen mit. Alternativ fächert eine Zuweisung in eine eigene Aufgabe je Ressort-Mitglied auf — für Fälle, in denen jeder einzeln liefern muss.",
          "Erledigte Aufgaben bleiben dauerhaft sichtbar. Es gibt keine automatische Löschfrist.",
          "Wer eine Aufgabe für falsch adressiert hält, lehnt sie mit Begründung ab, statt sie stillschweigend liegen zu lassen.",
          "Auf Wunsch muss der Zuweiser die Erledigung abnehmen. Die Aufgabe wartet dann als „Zur Abnahme“ und lässt sich mit Begründung zurückgeben."
        ]
      },
      {
        title: "Benachrichtigung per E-Mail",
        items: [
          "Wer eine neue Aufgabe bekommt, wird per E-Mail informiert — mit Titel, Ressort, Frist und Text.",
          "Benachrichtigt wird, wer die Aufgabe erledigen muss: bei einer Zuweisung an ein Ressort der Verantwortliche, bei einer aufgefächerten Zuweisung jedes Mitglied. Wer nur mitliest, bekommt keine Mail.",
          "Eine vertrauliche Aufgabe verrät in der E-Mail weder Titel noch Text — nur, dass es sie gibt, bis wann sie läuft und dass die Einzelheiten in der App stehen.",
          "Nur das Anlegen löst eine Mail aus. Erledigungen, Abnahmen und Kommentare bleiben bewusst still, damit aus der Benachrichtigung kein Rauschen wird.",
          "Die Adresse kommt aus den Trainerdaten. Ist dort keine hinterlegt, sagt die App beim Zuweisen ausdrücklich, wer keine E-Mail bekommen hat."
        ]
      },
      {
        title: "Ressorts und Zuständigkeiten",
        items: [
          "Jedes Ressort hat eine Zuständigkeitsbeschreibung, genau einen Verantwortlichen, einen Stellvertreter und weitere Mitglieder. Damit ist auch ohne offene Aufgabe beantwortet, wer wofür zuständig ist.",
          "Zuweisen darf, wer ein Ressort verantwortet oder vertritt — und zwar an die Mitglieder seines Ressorts. Wer die App administriert, weist jedem zu.",
          "Beim Ausscheiden lassen sich alle offenen Aufgaben einer Person in einem Schritt auf jemand anderen übertragen. Erledigtes bleibt beim ursprünglichen Bearbeiter stehen."
        ]
      },
      {
        title: "Nachvollziehbarkeit",
        items: [
          "Jede nachträgliche Änderung an Titel, Beschreibung, Frist oder Priorität wird am Vorgang protokolliert — mit altem und neuem Wert.",
          "Der Empfänger kann eine Aufgabe abhaken, ablehnen, kommentieren und einen Nachweis hochladen, ihren Text aber nie ändern.",
          "Gelöschte Aufgaben erscheinen im Protokoll der Verwaltung mit Zeitpunkt, Person und dem Status zum Zeitpunkt der Löschung.",
          "Bei vertraulichen Aufgaben sehen Unbeteiligte nur Empfänger, Frist und Status. Der Text wird schon auf dem Server entfernt und nicht bloß am Bildschirm ausgeblendet."
        ]
      },
      {
        title: "Übersicht",
        items: [
          "Startbild der Verwaltung ist die Personenübersicht: je Funktionär offen, überfällig und erledigt auf einen Blick, aufklappbar bis zur einzelnen Aufgabe.",
          "Daneben eine Gesamtliste, filterbar nach Person, Ressort, Status und Frist.",
          "Druckansicht und CSV-Export der gerade gefilterten Liste."
        ]
      },
      {
        title: "Wer darf was",
        items: [
          "Sehen: die eigenen Aufgaben und die des eigenen Ressorts.",
          "Bearbeiten: Aufgaben zuweisen im eigenen Ressort, abnehmen, Druckansicht und CSV-Export.",
          "Administrieren: Ressorts pflegen, jedem zuweisen, Aufgaben übertragen und das Protokoll einsehen.",
          "Der Reiter „Info“ ist für alle sichtbar."
        ]
      },
      {
        title: "Abgrenzung zu den eigenen ToDos",
        items: [
          "Hier steht, was einem anderen aufgetragen wird — mit Frist, Zuständigkeit und Abnahme.",
          "Was man sich selbst notiert, gehört in „Meine ToDos“ in der Kopfzeile der Tools-Übersicht. Zwei Orte für dieselbe Sache wären eine Doppelung."
        ]
      },
      {
        title: "Bedienung am Handy",
        items: [
          "Die Ansicht ist für das Handy gebaut und funktioniert dort vollständig.",
          "Eingabefelder sind mindestens 16 Pixel groß, damit der iPhone-Browser beim Antippen nicht ungefragt in die Seite hineinzoomt und verschoben stehen bleibt."
        ]
      }
    ]
  }
];
