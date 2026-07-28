# Vereinsaufgaben

Aufgabenverwaltung für die Funktionäre des 1. SC 1911 e.V. Heilbad Heiligenstadt.

Hier stehen Aufgaben, die jemandem **aufgetragen** werden — mit verbindlicher
Frist, klarer Zuständigkeit und einer Historie, die bestehen bleibt. Was man sich
selbst notiert, gehört weiterhin in die persönliche Liste auf der Startseite der
Tools-Übersicht.

## Was die App kann

**Ressorts** bilden die dauerhaften Zuständigkeiten ab: jedes hat eine
Beschreibung, genau einen Verantwortlichen, eine Stellvertretung und weitere
Mitglieder. Damit ist auch dann beantwortet, wer wofür zuständig ist, wenn gerade
keine Aufgabe offen ist.

**Aufgaben** gehen an einzelne Personen, an ein Ressort (der Verantwortliche
erledigt, die Mitglieder sehen mit) oder aufgefächert an jedes Ressort-Mitglied
einzeln. Frist ist Pflicht. Dazu Priorität, Beschreibung, Anhänge in beide
Richtungen und ein Rückfragen-Strang am Vorgang.

**Kontrolle:** Auf Wunsch muss die Erledigung abgenommen werden. Wer eine Aufgabe
für falsch adressiert hält, lehnt sie mit Begründung ab, statt sie liegen zu
lassen. Erledigtes wird nie automatisch gelöscht. Jede nachträgliche Änderung an
Titel, Frist oder Beschreibung steht mit altem und neuem Wert im Verlauf, jede
Löschung im Protokoll der Verwaltung.

**Übersicht:** Je Person offen, überfällig und erledigt auf einen Blick,
aufklappbar zu den einzelnen Vorgängen. Daneben eine filterbare Gesamtliste,
Druckansicht und CSV-Export.

## Rechte

| Stufe | Darf |
|---|---|
| Sehen | Übersicht, Listen und Ressorts lesen |
| Bearbeiten | eigene Aufgaben abhaken, ablehnen, kommentieren, Anhänge, Export |
| Administrieren | Ressorts pflegen, Protokoll, jede Aufgabe korrigieren, Amtsübergabe |

Aufgaben zuweisen darf, wer ein Ressort verantwortet oder vertritt — an dessen
Mitglieder. Wer die App administriert, weist jedem zu.

## Technik

Vanilla JavaScript, kein Build-Step. Anmeldung und Speicherung laufen über den
zentralen Login-Gateway der Tools-Übersicht; die Daten liegen in der
Vereins-Nextcloud. Anders als die übrigen Tools nutzt diese App keinen
generischen Speicherweg, sondern eigene Server-Aktionen — nur so lassen sich
vertrauliche Vorgänge, die Rollenregeln und das Protokoll wirklich durchsetzen
statt nur anzuzeigen.
