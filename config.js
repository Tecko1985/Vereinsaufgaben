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
    version: "1.1",
    groups: [
      {
        title: "Benachrichtigung per E-Mail",
        items: [
          "Wer eine neue Aufgabe bekommt, wird per E-Mail darüber informiert — mit Titel, Ressort, Frist und dem Text der Aufgabe. Bisher musste man die App von sich aus öffnen, um von einer laufenden Frist zu erfahren.",
          "Benachrichtigt wird, wer die Aufgabe erledigen muss: bei einer Zuweisung an das Ressort der Verantwortliche, bei einer aufgefächerten Zuweisung jedes Mitglied. Wer nur mitliest, bekommt keine Mail.",
          "Eine vertrauliche Aufgabe verrät in der E-Mail weder Titel noch Text — nur, dass es sie gibt, bis wann sie läuft und dass die Einzelheiten in der App stehen.",
          "Nur das Anlegen löst eine Mail aus. Erledigungen, Abnahmen und Kommentare bleiben bewusst still, damit die Benachrichtigung nicht zu Rauschen wird.",
          "Die Adresse kommt aus den Trainerdaten. Ist dort keine hinterlegt, sagt die App beim Zuweisen ausdrücklich, wer keine E-Mail bekommen hat."
        ]
      }
    ]
  },
  {
    version: "1.0",
    groups: [
      {
        title: "Aufgaben mit Frist",
        items: [
          "Aufgaben werden einer Person oder einem Ressort zugewiesen — mit Pflicht-Frist, Priorität, Beschreibung und optionalem Anhang.",
          "An ein Ressort zugewiesen heißt: der Verantwortliche erledigt, die Mitglieder sehen mit. Alternativ fächert eine Zuweisung in eine eigene Aufgabe je Ressort-Mitglied auf — für Fälle, in denen jeder einzeln liefern muss.",
          "Erledigte Aufgaben bleiben dauerhaft sichtbar. Es gibt keine automatische Löschfrist.",
          "Wer eine Aufgabe für falsch adressiert hält, lehnt sie mit Begründung ab, statt sie stillschweigend liegen zu lassen.",
          "Auf Wunsch muss der Zuweiser die Erledigung abnehmen: die Aufgabe wartet dann als „Zur Abnahme“ und kann mit Begründung zurückgegeben werden."
        ]
      },
      {
        title: "Ressorts und Zuständigkeiten",
        items: [
          "Jedes Ressort hat eine Zuständigkeitsbeschreibung, genau einen Verantwortlichen, einen Stellvertreter und weitere Mitglieder — damit ist auch ohne offene Aufgabe beantwortet, wer wofür zuständig ist.",
          "Zuweisen darf, wer ein Ressort verantwortet oder vertritt — und zwar an die Mitglieder seines Ressorts. Wer die App administriert, weist jedem zu.",
          "Beim Ausscheiden lassen sich alle offenen Aufgaben einer Person in einem Schritt auf jemand anderen übertragen. Erledigtes bleibt beim ursprünglichen Bearbeiter stehen."
        ]
      },
      {
        title: "Nachvollziehbarkeit",
        items: [
          "Jede nachträgliche Änderung an Titel, Beschreibung, Frist oder Priorität wird am Vorgang protokolliert — mit altem und neuem Wert.",
          "Der Empfänger kann eine Aufgabe abhaken, ablehnen, kommentieren und einen Nachweis hochladen, aber ihren Text nie ändern.",
          "Gelöschte Aufgaben erscheinen im Protokoll der Verwaltung, mit Zeitpunkt, Person und Status zum Zeitpunkt der Löschung.",
          "Vertrauliche Aufgaben zeigen Unbeteiligten nur Empfänger, Frist und Status — der Text wird dafür schon serverseitig entfernt, nicht bloß ausgeblendet."
        ]
      },
      {
        title: "Übersicht",
        items: [
          "Startbild der Verwaltung ist die Personenübersicht: je Funktionär offen, überfällig und erledigt auf einen Blick, aufklappbar zu den einzelnen Aufgaben.",
          "Daneben eine filterbare Gesamtliste nach Person, Ressort, Status und Frist.",
          "Druckansicht und CSV-Export der gerade gefilterten Liste, beides ab Bearbeiten-Recht."
        ]
      }
    ]
  }
];
