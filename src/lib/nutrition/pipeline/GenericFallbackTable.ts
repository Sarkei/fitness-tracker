export type GenericNutrients = {
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number;
};

export const GENERIC_NUTRITION_TABLE: Record<string, GenericNutrients> = {
  white_bread_generic: { kcal_100g: 265, protein_100g: 8.0, carbs_100g: 49.0, fat_100g: 3.2, fiber_100g: 2.7 },
  semmel_generic: { kcal_100g: 275, protein_100g: 8.5, carbs_100g: 50.0, fat_100g: 3.0, fiber_100g: 2.5 },
  leberkaese_generic: { kcal_100g: 326, protein_100g: 13.0, carbs_100g: 2.5, fat_100g: 29.0, fiber_100g: 0.0 },
  mustard_generic: { kcal_100g: 120, protein_100g: 4.0, carbs_100g: 12.0, fat_100g: 6.0, fiber_100g: 2.0 },
  wholegrain_bread_generic: { kcal_100g: 247, protein_100g: 12.1, carbs_100g: 41.0, fat_100g: 4.2, fiber_100g: 7.0 },
  pita_bread_generic: { kcal_100g: 275, protein_100g: 9.0, carbs_100g: 55.0, fat_100g: 1.2, fiber_100g: 2.2 },
  wrap_tortilla_generic: { kcal_100g: 310, protein_100g: 8.5, carbs_100g: 50.0, fat_100g: 8.2, fiber_100g: 3.5 },
  croissant_generic: { kcal_100g: 406, protein_100g: 8.2, carbs_100g: 45.8, fat_100g: 21.0, fiber_100g: 2.6 },
  oats_dry_generic: { kcal_100g: 389, protein_100g: 16.9, carbs_100g: 66.3, fat_100g: 6.9, fiber_100g: 10.6 },
  muesli_generic: { kcal_100g: 372, protein_100g: 10.0, carbs_100g: 64.0, fat_100g: 7.0, fiber_100g: 8.0 },
  cornflakes_generic: { kcal_100g: 357, protein_100g: 7.4, carbs_100g: 84.0, fat_100g: 0.4, fiber_100g: 3.0 },
  rice_cooked_generic: { kcal_100g: 130, protein_100g: 2.7, carbs_100g: 28.2, fat_100g: 0.3, fiber_100g: 0.4 },
  rice_dry_generic: { kcal_100g: 365, protein_100g: 7.1, carbs_100g: 79.0, fat_100g: 0.7, fiber_100g: 1.3 },
  pasta_cooked_generic: { kcal_100g: 131, protein_100g: 5.0, carbs_100g: 25.0, fat_100g: 1.1, fiber_100g: 1.8 },
  pasta_dry_generic: { kcal_100g: 357, protein_100g: 12.5, carbs_100g: 71.2, fat_100g: 1.5, fiber_100g: 3.0 },
  quinoa_cooked_generic: { kcal_100g: 120, protein_100g: 4.4, carbs_100g: 21.3, fat_100g: 1.9, fiber_100g: 2.8 },
  couscous_cooked_generic: { kcal_100g: 112, protein_100g: 3.8, carbs_100g: 23.2, fat_100g: 0.2, fiber_100g: 1.4 },
  potato_boiled_generic: { kcal_100g: 87, protein_100g: 1.9, carbs_100g: 20.1, fat_100g: 0.1, fiber_100g: 1.8 },
  potato_fries_generic: { kcal_100g: 312, protein_100g: 3.4, carbs_100g: 41.0, fat_100g: 15.0, fiber_100g: 3.8 },
  sweet_potato_generic: { kcal_100g: 86, protein_100g: 1.6, carbs_100g: 20.1, fat_100g: 0.1, fiber_100g: 3.0 },
  chicken_breast_grilled_generic: { kcal_100g: 165, protein_100g: 31.0, carbs_100g: 0.0, fat_100g: 3.6, fiber_100g: 0.0 },
  chicken_thigh_cooked_generic: { kcal_100g: 209, protein_100g: 26.0, carbs_100g: 0.0, fat_100g: 10.9, fiber_100g: 0.0 },
  turkey_breast_cooked_generic: { kcal_100g: 135, protein_100g: 29.0, carbs_100g: 0.0, fat_100g: 1.6, fiber_100g: 0.0 },
  beef_ground_cooked_generic: { kcal_100g: 254, protein_100g: 26.0, carbs_100g: 0.0, fat_100g: 16.0, fiber_100g: 0.0 },
  beef_steak_generic: { kcal_100g: 271, protein_100g: 25.0, carbs_100g: 0.0, fat_100g: 19.0, fiber_100g: 0.0 },
  pork_generic: { kcal_100g: 242, protein_100g: 27.0, carbs_100g: 0.0, fat_100g: 14.0, fiber_100g: 0.0 },
  schnitzel_breaded_generic: { kcal_100g: 280, protein_100g: 20.0, carbs_100g: 13.0, fat_100g: 17.0, fiber_100g: 1.2 },
  bacon_generic: { kcal_100g: 541, protein_100g: 37.0, carbs_100g: 1.4, fat_100g: 42.0, fiber_100g: 0.0 },
  salmon_generic: { kcal_100g: 208, protein_100g: 20.4, carbs_100g: 0.0, fat_100g: 13.4, fiber_100g: 0.0 },
  tuna_canned_generic: { kcal_100g: 116, protein_100g: 25.5, carbs_100g: 0.0, fat_100g: 0.8, fiber_100g: 0.0 },
  shrimp_generic: { kcal_100g: 99, protein_100g: 24.0, carbs_100g: 0.2, fat_100g: 0.3, fiber_100g: 0.0 },
  egg_whole_generic: { kcal_100g: 155, protein_100g: 12.6, carbs_100g: 1.1, fat_100g: 10.6, fiber_100g: 0.0 },
  egg_white_generic: { kcal_100g: 52, protein_100g: 10.9, carbs_100g: 0.7, fat_100g: 0.2, fiber_100g: 0.0 },
  tofu_generic: { kcal_100g: 144, protein_100g: 15.7, carbs_100g: 3.4, fat_100g: 8.7, fiber_100g: 1.2 },
  tempeh_generic: { kcal_100g: 193, protein_100g: 20.3, carbs_100g: 9.4, fat_100g: 10.8, fiber_100g: 1.4 },
  lentils_cooked_generic: { kcal_100g: 116, protein_100g: 9.0, carbs_100g: 20.1, fat_100g: 0.4, fiber_100g: 7.9 },
  chickpeas_cooked_generic: { kcal_100g: 164, protein_100g: 8.9, carbs_100g: 27.4, fat_100g: 2.6, fiber_100g: 7.6 },
  beans_cooked_generic: { kcal_100g: 127, protein_100g: 8.7, carbs_100g: 22.8, fat_100g: 0.5, fiber_100g: 6.4 },
  whole_milk_generic: { kcal_100g: 61, protein_100g: 3.2, carbs_100g: 4.8, fat_100g: 3.3, fiber_100g: 0.0 },
  skim_milk_generic: { kcal_100g: 35, protein_100g: 3.4, carbs_100g: 5.0, fat_100g: 0.2, fiber_100g: 0.0 },
  oat_milk_generic: { kcal_100g: 46, protein_100g: 1.0, carbs_100g: 6.7, fat_100g: 1.5, fiber_100g: 0.8 },
  almond_milk_generic: { kcal_100g: 24, protein_100g: 0.6, carbs_100g: 0.3, fat_100g: 2.1, fiber_100g: 0.2 },
  yogurt_plain_generic: { kcal_100g: 59, protein_100g: 10.0, carbs_100g: 3.6, fat_100g: 0.4, fiber_100g: 0.0 },
  greek_yogurt_generic: { kcal_100g: 97, protein_100g: 9.0, carbs_100g: 3.9, fat_100g: 5.0, fiber_100g: 0.0 },
  quark_generic: { kcal_100g: 67, protein_100g: 12.0, carbs_100g: 3.9, fat_100g: 0.2, fiber_100g: 0.0 },
  cottage_cheese_generic: { kcal_100g: 98, protein_100g: 11.1, carbs_100g: 3.4, fat_100g: 4.3, fiber_100g: 0.0 },
  cheese_cheddar_generic: { kcal_100g: 402, protein_100g: 25.0, carbs_100g: 1.3, fat_100g: 33.0, fiber_100g: 0.0 },
  parmesan_generic: { kcal_100g: 431, protein_100g: 38.0, carbs_100g: 4.1, fat_100g: 29.0, fiber_100g: 0.0 },
  mozzarella_generic: { kcal_100g: 280, protein_100g: 28.0, carbs_100g: 3.1, fat_100g: 17.0, fiber_100g: 0.0 },
  butter_generic: { kcal_100g: 717, protein_100g: 0.9, carbs_100g: 0.1, fat_100g: 81.1, fiber_100g: 0.0 },
  olive_oil_generic: { kcal_100g: 884, protein_100g: 0.0, carbs_100g: 0.0, fat_100g: 100.0, fiber_100g: 0.0 },
  canola_oil_generic: { kcal_100g: 884, protein_100g: 0.0, carbs_100g: 0.0, fat_100g: 100.0, fiber_100g: 0.0 },
  mayonnaise_generic: { kcal_100g: 680, protein_100g: 1.0, carbs_100g: 0.6, fat_100g: 75.0, fiber_100g: 0.0 },
  tzatziki_generic: { kcal_100g: 95, protein_100g: 4.5, carbs_100g: 4.0, fat_100g: 6.5, fiber_100g: 0.3 },
  garlic_sauce_generic: { kcal_100g: 280, protein_100g: 1.5, carbs_100g: 8.0, fat_100g: 26.0, fiber_100g: 0.2 },
  ketchup_generic: { kcal_100g: 112, protein_100g: 1.3, carbs_100g: 25.8, fat_100g: 0.2, fiber_100g: 0.3 },
  bbq_sauce_generic: { kcal_100g: 172, protein_100g: 1.2, carbs_100g: 39.0, fat_100g: 0.7, fiber_100g: 1.1 },
  tomato_sauce_generic: { kcal_100g: 45, protein_100g: 1.8, carbs_100g: 7.5, fat_100g: 0.8, fiber_100g: 1.8 },
  pesto_generic: { kcal_100g: 460, protein_100g: 4.7, carbs_100g: 6.0, fat_100g: 46.0, fiber_100g: 1.8 },
  peanut_butter_generic: { kcal_100g: 588, protein_100g: 25.0, carbs_100g: 20.0, fat_100g: 50.0, fiber_100g: 6.0 },
  jam_generic: { kcal_100g: 250, protein_100g: 0.4, carbs_100g: 65.0, fat_100g: 0.1, fiber_100g: 0.8 },
  honey_generic: { kcal_100g: 304, protein_100g: 0.3, carbs_100g: 82.4, fat_100g: 0.0, fiber_100g: 0.2 },
  sugar_generic: { kcal_100g: 387, protein_100g: 0.0, carbs_100g: 100.0, fat_100g: 0.0, fiber_100g: 0.0 },
  banana_generic: { kcal_100g: 89, protein_100g: 1.1, carbs_100g: 22.8, fat_100g: 0.3, fiber_100g: 2.6 },
  apple_generic: { kcal_100g: 52, protein_100g: 0.3, carbs_100g: 13.8, fat_100g: 0.2, fiber_100g: 2.4 },
  orange_generic: { kcal_100g: 47, protein_100g: 0.9, carbs_100g: 11.8, fat_100g: 0.1, fiber_100g: 2.4 },
  berries_generic: { kcal_100g: 50, protein_100g: 0.7, carbs_100g: 12.0, fat_100g: 0.3, fiber_100g: 4.0 },
  grapes_generic: { kcal_100g: 69, protein_100g: 0.7, carbs_100g: 18.0, fat_100g: 0.2, fiber_100g: 0.9 },
  avocado_generic: { kcal_100g: 160, protein_100g: 2.0, carbs_100g: 8.5, fat_100g: 14.7, fiber_100g: 6.7 },
  lettuce_generic: { kcal_100g: 15, protein_100g: 1.4, carbs_100g: 2.2, fat_100g: 0.2, fiber_100g: 1.3 },
  tomato_fresh_generic: { kcal_100g: 18, protein_100g: 0.9, carbs_100g: 3.9, fat_100g: 0.2, fiber_100g: 1.2 },
  cucumber_generic: { kcal_100g: 15, protein_100g: 0.7, carbs_100g: 3.6, fat_100g: 0.1, fiber_100g: 0.5 },
  onion_raw_generic: { kcal_100g: 40, protein_100g: 1.1, carbs_100g: 9.3, fat_100g: 0.1, fiber_100g: 1.7 },
  cabbage_white_generic: { kcal_100g: 25, protein_100g: 1.3, carbs_100g: 5.8, fat_100g: 0.1, fiber_100g: 2.5 },
  carrot_generic: { kcal_100g: 41, protein_100g: 0.9, carbs_100g: 9.6, fat_100g: 0.2, fiber_100g: 2.8 },
  broccoli_generic: { kcal_100g: 34, protein_100g: 2.8, carbs_100g: 6.6, fat_100g: 0.4, fiber_100g: 2.6 },
  spinach_generic: { kcal_100g: 23, protein_100g: 2.9, carbs_100g: 3.6, fat_100g: 0.4, fiber_100g: 2.2 },
  mushroom_generic: { kcal_100g: 22, protein_100g: 3.1, carbs_100g: 3.3, fat_100g: 0.3, fiber_100g: 1.0 },
  paprika_generic: { kcal_100g: 31, protein_100g: 1.0, carbs_100g: 6.0, fat_100g: 0.3, fiber_100g: 2.1 },
  zucchini_generic: { kcal_100g: 17, protein_100g: 1.2, carbs_100g: 3.1, fat_100g: 0.3, fiber_100g: 1.0 },
  corn_generic: { kcal_100g: 96, protein_100g: 3.4, carbs_100g: 21.0, fat_100g: 1.5, fiber_100g: 2.4 },
  peas_generic: { kcal_100g: 81, protein_100g: 5.4, carbs_100g: 14.5, fat_100g: 0.4, fiber_100g: 5.1 },
  almonds_generic: { kcal_100g: 579, protein_100g: 21.2, carbs_100g: 21.6, fat_100g: 49.9, fiber_100g: 12.5 },
  walnuts_generic: { kcal_100g: 654, protein_100g: 15.2, carbs_100g: 13.7, fat_100g: 65.2, fiber_100g: 6.7 },
  cashews_generic: { kcal_100g: 553, protein_100g: 18.2, carbs_100g: 30.2, fat_100g: 43.8, fiber_100g: 3.3 },
  peanuts_generic: { kcal_100g: 567, protein_100g: 25.8, carbs_100g: 16.1, fat_100g: 49.2, fiber_100g: 8.5 },
  chia_seeds_generic: { kcal_100g: 486, protein_100g: 16.5, carbs_100g: 42.1, fat_100g: 30.7, fiber_100g: 34.4 },
  whey_powder_generic: { kcal_100g: 395, protein_100g: 78.0, carbs_100g: 8.0, fat_100g: 6.0, fiber_100g: 0.0 },
  protein_bar_generic: { kcal_100g: 370, protein_100g: 32.0, carbs_100g: 35.0, fat_100g: 12.0, fiber_100g: 8.0 },
  protein_shake_ready_generic: { kcal_100g: 60, protein_100g: 8.0, carbs_100g: 5.0, fat_100g: 1.0, fiber_100g: 0.0 },
  cola_generic: { kcal_100g: 42, protein_100g: 0.0, carbs_100g: 10.6, fat_100g: 0.0, fiber_100g: 0.0 },
  orange_juice_generic: { kcal_100g: 45, protein_100g: 0.7, carbs_100g: 10.4, fat_100g: 0.2, fiber_100g: 0.2 },
  apple_juice_generic: { kcal_100g: 46, protein_100g: 0.1, carbs_100g: 11.3, fat_100g: 0.1, fiber_100g: 0.2 },
  beer_generic: { kcal_100g: 43, protein_100g: 0.5, carbs_100g: 3.6, fat_100g: 0.0, fiber_100g: 0.0 },
  wine_generic: { kcal_100g: 85, protein_100g: 0.1, carbs_100g: 2.6, fat_100g: 0.0, fiber_100g: 0.0 },
  latte_macchiato_generic: { kcal_100g: 50, protein_100g: 2.5, carbs_100g: 4.8, fat_100g: 2.2, fiber_100g: 0.0 },
  cappuccino_generic: { kcal_100g: 32, protein_100g: 1.8, carbs_100g: 3.1, fat_100g: 1.3, fiber_100g: 0.0 },
  burger_generic: { kcal_100g: 250, protein_100g: 12.0, carbs_100g: 28.0, fat_100g: 10.0, fiber_100g: 1.8 },
  cheeseburger_generic: { kcal_100g: 300, protein_100g: 14.0, carbs_100g: 27.0, fat_100g: 15.0, fiber_100g: 1.6 },
  big_mac_style_generic: { kcal_100g: 257, protein_100g: 12.0, carbs_100g: 20.0, fat_100g: 14.0, fiber_100g: 1.3 },
  pizza_margherita_generic: { kcal_100g: 267, protein_100g: 11.0, carbs_100g: 33.0, fat_100g: 10.0, fiber_100g: 2.3 },
  pizza_salami_generic: { kcal_100g: 290, protein_100g: 12.5, carbs_100g: 30.0, fat_100g: 13.8, fiber_100g: 2.5 },
  doner_kebab_generic: { kcal_100g: 215, protein_100g: 10.0, carbs_100g: 18.0, fat_100g: 11.0, fiber_100g: 1.8 },
  shawarma_generic: { kcal_100g: 220, protein_100g: 12.0, carbs_100g: 16.0, fat_100g: 12.0, fiber_100g: 1.8 },
  currywurst_generic: { kcal_100g: 270, protein_100g: 11.0, carbs_100g: 9.0, fat_100g: 20.0, fiber_100g: 1.0 },
  lasagna_generic: { kcal_100g: 160, protein_100g: 8.0, carbs_100g: 12.0, fat_100g: 8.0, fiber_100g: 1.5 },
  spaghetti_bolognese_generic: { kcal_100g: 143, protein_100g: 6.6, carbs_100g: 17.0, fat_100g: 5.2, fiber_100g: 1.7 },
  pad_thai_generic: { kcal_100g: 150, protein_100g: 5.5, carbs_100g: 20.0, fat_100g: 5.0, fiber_100g: 1.8 },
  chicken_tikka_masala_generic: { kcal_100g: 180, protein_100g: 11.0, carbs_100g: 8.0, fat_100g: 11.0, fiber_100g: 1.3 },
  sushi_mixed_generic: { kcal_100g: 145, protein_100g: 6.0, carbs_100g: 24.0, fat_100g: 2.5, fiber_100g: 1.0 },
  ramen_generic: { kcal_100g: 115, protein_100g: 4.0, carbs_100g: 17.0, fat_100g: 3.2, fiber_100g: 0.9 },
  burrito_generic: { kcal_100g: 185, protein_100g: 8.0, carbs_100g: 20.0, fat_100g: 8.0, fiber_100g: 3.0 },
  kebab_sauce_generic: { kcal_100g: 220, protein_100g: 2.0, carbs_100g: 7.0, fat_100g: 20.0, fiber_100g: 0.4 },
  cheesecake_generic: { kcal_100g: 321, protein_100g: 5.7, carbs_100g: 25.5, fat_100g: 22.5, fiber_100g: 0.7 },
  chocolate_generic: { kcal_100g: 546, protein_100g: 4.9, carbs_100g: 61.0, fat_100g: 31.0, fiber_100g: 7.0 },
  icecream_generic: { kcal_100g: 207, protein_100g: 3.5, carbs_100g: 24.0, fat_100g: 11.0, fiber_100g: 0.7 },
  cookie_generic: { kcal_100g: 502, protein_100g: 5.9, carbs_100g: 64.0, fat_100g: 24.0, fiber_100g: 2.4 },
  soup_chicken_generic: { kcal_100g: 45, protein_100g: 2.5, carbs_100g: 4.0, fat_100g: 2.0, fiber_100g: 0.4 },
  instant_noodle_soup_generic: { kcal_100g: 70, protein_100g: 2.1, carbs_100g: 9.0, fat_100g: 2.7, fiber_100g: 0.7 },
  falafel_generic: { kcal_100g: 333, protein_100g: 13.3, carbs_100g: 31.8, fat_100g: 17.8, fiber_100g: 4.9 },
  hummus_generic: { kcal_100g: 237, protein_100g: 8.0, carbs_100g: 14.0, fat_100g: 17.0, fiber_100g: 6.0 },
  feta_generic: { kcal_100g: 264, protein_100g: 14.0, carbs_100g: 4.1, fat_100g: 21.0, fiber_100g: 0.0 },
};

const GENERIC_ALIASES: Record<string, keyof typeof GENERIC_NUTRITION_TABLE> = {
  semmel: 'semmel_generic',
  broetchen: 'semmel_generic',
  brötchen: 'semmel_generic',
  leberkaese: 'leberkaese_generic',
  leberkäse: 'leberkaese_generic',
  fleischkaese: 'leberkaese_generic',
  senf: 'mustard_generic',
  suesser_senf: 'mustard_generic',
  süsser_senf: 'mustard_generic',
  tomate: 'tomato_fresh_generic',
  tomaten: 'tomato_fresh_generic',
  zwiebel: 'onion_raw_generic',
  zwiebeln: 'onion_raw_generic',
  haehnchen: 'chicken_breast_grilled_generic',
  hahnchen: 'chicken_breast_grilled_generic',
  huehnchen: 'chicken_breast_grilled_generic',
  huhn: 'chicken_breast_grilled_generic',
  chicken: 'chicken_breast_grilled_generic',
  kartoffel: 'potato_boiled_generic',
  kartoffeln: 'potato_boiled_generic',
  feta: 'feta_generic',
  fetas: 'feta_generic',
  schafskaese: 'feta_generic',
  olivenoel: 'olive_oil_generic',
  olivenöl: 'olive_oil_generic',
  olive_oil: 'olive_oil_generic',
  rapsoel: 'canola_oil_generic',
  rapsöl: 'canola_oil_generic',
};

function normalizeGenericId(id: string): string {
  return id
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Tabellen-Key (z. B. `paprika_generic`) für Slug oder deutschen Namen. */
export function resolveGenericTableKey(id: string): keyof typeof GENERIC_NUTRITION_TABLE | null {
  const trimmed = id.trim();
  if (!trimmed) return null;

  const direct = GENERIC_NUTRITION_TABLE[trimmed as keyof typeof GENERIC_NUTRITION_TABLE];
  if (direct) return trimmed as keyof typeof GENERIC_NUTRITION_TABLE;

  const key = normalizeGenericId(trimmed);
  if (!key) return null;

  const alias = GENERIC_ALIASES[key];
  if (alias) return alias;

  const withGeneric = `${key}_generic` as keyof typeof GENERIC_NUTRITION_TABLE;
  if (GENERIC_NUTRITION_TABLE[withGeneric]) return withGeneric;

  if (key.includes('semmel') || key.includes('broetchen')) return 'semmel_generic';
  if (key.includes('leberkaes') || key.includes('fleischkaes')) return 'leberkaese_generic';
  if (key.includes('senf') || key.includes('mustard')) return 'mustard_generic';
  if (key.includes('tomate')) return 'tomato_fresh_generic';
  if (key.includes('zwiebel')) return 'onion_raw_generic';
  if (key.includes('haehnchen') || key.includes('huhn') || key.includes('chicken')) {
    return 'chicken_breast_grilled_generic';
  }
  if (key.includes('kartoffel')) return 'potato_boiled_generic';
  if (key.includes('feta')) return 'feta_generic';
  if (key.includes('oliven') && key.includes('ol')) return 'olive_oil_generic';
  if (key.includes('olive') && key.includes('oil')) return 'olive_oil_generic';
  if (key.includes('raps') && key.includes('ol')) return 'canola_oil_generic';

  let best: keyof typeof GENERIC_NUTRITION_TABLE | null = null;
  let bestLen = 0;
  for (const tableKey of Object.keys(GENERIC_NUTRITION_TABLE) as Array<keyof typeof GENERIC_NUTRITION_TABLE>) {
    if (!String(tableKey).endsWith('_generic')) continue;
    const base = String(tableKey).replace(/_generic$/, '');
    const parts = base.split('_').filter((p) => p.length >= 4);
    for (const part of parts) {
      if (key.includes(part) || part.includes(key)) {
        const len = Math.min(key.length, part.length);
        if (len >= 4 && len > bestLen) {
          bestLen = len;
          best = tableKey;
        }
      }
    }
  }
  return best;
}

export function getGenericFallback(id: string): GenericNutrients | null {
  const tableKey = resolveGenericTableKey(id);
  return tableKey ? (GENERIC_NUTRITION_TABLE[tableKey] ?? null) : null;
}
