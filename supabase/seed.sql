-- Seed blocks around Hallandsåsen (run after migration)
insert into public.blocks (
  source, fornsok_id, name, description, lamningstyp, egenskapsvarde,
  lat, lng, climb_score, score_rationale, county, municipality
) values
(
  'fornsok',
  'seed-L1990:halland-1',
  'Jättekastet vid Boarp',
  'Flyttblock, 8 x 5 m (NV-SÖ) och 4,5 m h. Lodräta sidor mot SV. Något överhängande på norra sidan. Beläget i beteshage ca 40 m Ö om skogsbilväg.',
  'Naturföremål/-bildning med bruk, tradition eller namn',
  'Jättekast/flyttblock',
  56.2985, 13.0124, 5,
  'Stort block med lodräta väggar och överhäng — tydlig boulderpotential enligt mått och exponering.',
  'Halland', 'Båstad'
),
(
  'fornsok',
  'seed-L1990:halland-2',
  'Blocket vid Ängeltofta',
  'Flyttblock, 3 x 2,5 m och 1,8 m h. Rundat, delvis nedgrävt i morän. Inga lodräta sidor.',
  'Naturföremål/-bildning med bruk, tradition eller namn',
  'Jättekast/flyttblock',
  56.3122, 12.8910, 2,
  'Lågt och rundat; begränsad klätterhöjd och få greppytor.',
  'Skåne', 'Ängelholm'
),
(
  'fornsok',
  'seed-L1990:halland-3',
  'Månsas sten (seed)',
  'Flyttblock med namn, 6 x 5 m (NNÖ-SSV) och 4 m h. Vertikal sydsida. Mellan två block löper en stenmur.',
  'Naturföremål/-bildning med bruk, tradition eller namn',
  'Jättekast/flyttblock',
  56.2751, 13.1178, 4,
  'Fyra meter högt med vertikal sida — bra kandidat för bouldering om tillgängligt.',
  'Skåne', 'Ängelholm'
),
(
  'fornsok',
  'seed-L1990:halland-4',
  'Skogblocket Vitsjö',
  'Flyttblock, ca 5 m i diam och 3 m h. Mossbevuxet. Beläget i tät granskog, svårtillgängligt.',
  'Naturföremål/-bildning med bruk, tradition eller namn',
  'Jättekast/flyttblock',
  56.3310, 13.1450, 3,
  'Tillräcklig höjd men mossigt och skuggigt läge sänker praktisk klätterkvalitet.',
  'Halland', 'Båstad'
),
(
  'fornsok',
  'seed-L1990:halland-5',
  'Klövasten',
  'Naturföremål, flyttblock 10 x 7 m och 6 m h. Brant västsida. Traditionellt namn enligt ortsbefolkning.',
  'Naturföremål/-bildning med bruk, tradition eller namn',
  'Jättekast/flyttblock',
  56.2604, 12.9780, 5,
  'Exceptionell storlek och brant vägg — högst prioritet att besöka.',
  'Halland', 'Laholm'
),
(
  'fornsok',
  'seed-L1990:halland-6',
  'Litet block Östra Karup',
  'Flyttblock, 1,5 x 1 m och 0,8 m h. Ligger i åkerkant.',
  'Naturföremål/-bildning med bruk, tradition eller namn',
  'Jättekast/flyttblock',
  56.3450, 12.9200, 1,
  'För litet för meningsfull klättring.',
  'Halland', 'Båstad'
),
(
  'fornsok',
  'seed-L1990:halland-7',
  'Röseblocket Hov',
  'Flyttblock invid röse, 4 x 3 m och 2,5 m h. Delvis söndersprängt. Östra sidan relativ plan.',
  'Naturföremål/-bildning med bruk, tradition eller namn',
  'Jättekast/flyttblock',
  56.2890, 12.8500, 3,
  'Medelhöjd; skador och kulturmiljökontext kräver försiktighet.',
  'Halland', 'Båstad'
),
(
  'user',
  null,
  'Okänt block vid snitslad stig',
  'Upptäckt vid skogspromenad. Ca 3 m högt, fin greppig sydvägg. Inte i Fornsök såvitt känt.',
  null,
  null,
  56.3055, 13.0550, 4,
  'Användarbidrag — bedömt som lovande vid besök.',
  'Halland', 'Båstad'
);
