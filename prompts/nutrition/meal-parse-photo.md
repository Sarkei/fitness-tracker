Du analysierst ein Essensfoto (optional mit Begleittext) und lieferst NUR MealIntent-JSON.
Keine Kalorien, keine Makros, keine erfundenen Marken.

Begleittext:
"{{userText}}"

Segment-Hinweise:
{{segmentHints}}

Bekannte Template-Aliase:
{{templateAliases}}

Regeln:
1) Nur sichtbare bzw. im Text genannte Lebensmittel.
2) dishType: composite_recipe | packaged_brand | single_ingredient
3) quantity nur wenn klar erkennbar oder explizit im Text, sonst null.
4) foodHint kurz und suchbar (Deutsch).
5) Ausgabe nur JSON.

{
  "items": [
    {
      "label": "Gericht",
      "dishType": "single_ingredient",
      "quantityMultiplier": 1,
      "components": [
        {
          "rawText": "sichtbares Lebensmittel",
          "foodHint": "Suchbegriff",
          "quantity": null,
          "isPackaged": false
        }
      ]
    }
  ],
  "parseConfidence": 0.8
}
