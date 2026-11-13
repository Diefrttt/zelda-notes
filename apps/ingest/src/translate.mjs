// Generates data/es.json with complete Spanish translations for UI data (maps, submaps, categories, areas, marker names & descriptions).
// Keeps internal English keys intact in markers.json so save/scene matching continues working untouched.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const data = path.join(root, 'data');

const categories = {
  Collectibles: 'Coleccionables',
  Labels: 'Etiquetas',
  'Treasure Chests': 'Cofres del tesoro',
  Locations: 'Lugares',
  'Points of Interest': 'Puntos de interés',
  'Travel Points': 'Puntos de viaje',
  'Items & Equipment': 'Objetos y equipo',
  'Gold Skulltulas': 'Skulltulas doradas',
  'Heart Pieces': 'Piezas de corazón',
  'Big Poes': 'Grandes Poes',
  'Heart Containers': 'Contenedores de corazón',
  'Silver Rupees': 'Rupias plateadas',
  Bottles: 'Botellas',
  'Fairy Thoughts': 'Pensamientos de hada',
  'Ocarina Songs': 'Canciones de ocarina',
  'Area Labels': 'Etiquetas de zona',
  'Other Treasure': 'Otros tesoros',
  Weapons: 'Armas',
  Shields: 'Escudos',
  'Equipment & Tools': 'Equipo y herramientas',
  'Dungeon Maps': 'Mapas de mazmorra',
  Compasses: 'Brújulas',
  'Small Keys': 'Llaves pequeñas',
  'Boss Keys': 'Llaves de jefe',
  Shops: 'Tiendas',
  'Great Fairy Fountains': 'Fuentes de la Gran Hada',
  Minigames: 'Minijuegos',
  NPCs: 'Personajes (NPC)',
  'Boss Doors': 'Puertas de jefe',
  'Gossip Stones': 'Piedras cotilla',
  'Magic Bean Spots': 'Tierra para frijoles mágicos',
  'Business Scrubs': 'Mercaderes Deku',
  Cows: 'Vacas',
  'Dungeon Entrances': 'Entradas a mazmorras',
  'Warp Pads': 'Portales de teletransporte',
  'Kaepora Gaebora': 'Kaepora Gaebora',
  'Gossip Quests': 'Pistas de rumores',
  'Armor & Shields': 'Armaduras y escudos',
  'Tools & Quest Items': 'Herramientas y objetos de misión',
  'Capacity & Upgrades': 'Capacidad y mejoras',
  Spells: 'Hechizos',
  Masks: 'Máscaras',
};

const areas = {
  'Bottom of the Well': 'Fondo del Pozo',
  'Death Mountain Crater': 'Cráter de la Montaña de la Muerte',
  'Death Mountain Trail': 'Sendero de la Montaña de la Muerte',
  'Desert Colossus': 'Coloso del Desierto',
  "Dodongo's Cavern": 'Caverna de Dodongo',
  'Fire Temple': 'Templo del Fuego',
  'Forest Temple': 'Templo del Bosque',
  "Ganon's Castle": 'Castillo de Ganon',
  'Gerudo Valley': 'Valle Gerudo',
  "Gerudo's Fortress": 'Fortaleza Gerudo',
  'Goron City': 'Ciudad Goron',
  Graveyard: 'Cementerio',
  'Haunted Wasteland': 'Yermo Encantado',
  'Hyrule Castle': 'Castillo de Hyrule',
  'Hyrule Field': 'Pradera de Hyrule',
  'Ice Cavern': 'Caverna de Hielo',
  "Inside Jabu-Jabu's Belly": 'Interior de Jabu-Jabu',
  'Inside the Deku Tree': 'Interior del Árbol Deku',
  'Kakariko Village': 'Aldea Kakariko',
  'Kokiri Forest': 'Bosque Kokiri',
  'Lake Hylia': 'Lago Hylia',
  'Lon Lon Ranch': 'Rancho Lon Lon',
  'Lost Woods': 'Bosque Perdido',
  Market: 'Mercado',
  'Sacred Forest Meadow': 'Prado Sagrado del Bosque',
  'Sacred Grove': 'Arboleda Sagrada',
  'Shadow Temple': 'Templo de las Sombras',
  'Spirit Temple': 'Templo del Espíritu',
  'Water Temple': 'Templo del Agua',
  "Zora's Domain": 'Dominio Zora',
  "Zora's Fountain": 'Fuente Zora',
  "Zora's River": 'Río Zora',
};

const maps = {
  Hyrule: 'Hyrule',
  ...areas,
};

function translateSubmap(s) {
  if (s === 'Child') return 'Niño';
  if (s === 'Adult') return 'Adulto';
  return s.replace('Water level', 'Nivel de agua');
}

const ITEMS_ES = {
  Hookshot: 'Gancho',
  Longshot: 'Supergancho',
  'Business Scrub Seed': 'Semilla de Mercader Deku',
  'Purple Rupee': 'Rupia púrpura',
  'Kokiri Sword': 'Espada Kokiri',
  'Green Rupee': 'Rupia verde',
  'Blue Rupee': 'Rupia azul',
  'Golden Gauntlets': 'Guanteletes de oro',
  'Silver Gauntlets': 'Guanteletes de plata',
  'Red Rupee': 'Rupia roja',
  'Hylian Shield': 'Escudo hyliano',
  'Mirror Shield': 'Escudo espejo',
  'Deku Shield': 'Escudo Deku',
  'Ice Arrow': 'Flecha de hielo',
  'Dungeon Map': 'Mapa de la mazmorra',
  'Small Key': 'Llave pequeña',
  'Boss Key': 'Llave del jefe',
  Compass: 'Brújula',
  'Five Bombs': 'Cinco bombas',
  'Five Bombchus': 'Cinco bombchus',
  'Large Magic Jar': 'Frasco de magia grande',
  'Hover Boots': 'Botas voladoras',
  'Iron Boots': 'Botas de hierro',
  'Three Deku Sticks': 'Tres palos Deku',
  'Three Deku Nuts': 'Tres nueces Deku',
  'Fairy Slingshot': 'Tirachinas de las hadas',
  Boomerang: 'Bumerán',
  '10 Arrows': '10 flechas',
  'Fairy Bow': 'Arco de las hadas',
  'Megaton Hammer': 'Martillo Megatón',
  'Bomb Bag': 'Saco de bombas',
  'Lens of Truth': 'Lente de la Verdad',
  Morpha: 'Morpha',
  Twinrova: 'Twinrova',
  'Bongo Bongo': 'Bongo Bongo',
  Gohma: 'Gohma',
  Barinade: 'Barinade',
  'Phantom Ganon': 'Ganon Fantasma',
  Volvagia: 'Volvagia',
  'King Dodongo': 'Rey Dodongo',
  'Bolero of Fire': 'Bolero del Fuego',
  'Prelude of Light': 'Preludio de la Luz',
  'Requiem of Spirit': 'Réquiem del Espíritu',
  'Nocturne of Shadow': 'Nocturno de la Sombra',
  'Minuet of Forest': 'Minueto del Bosque',
  'Serenade of Water': 'Serenata del Agua',
  'Song of Storms': 'Canción de las Tormentas',
  'Song of Time': 'Canción del Tiempo',
  "Sun's Song": 'Canción del Sol',
  "Saria's Song": 'Canción de Saria',
  "Epona's Song": 'Canción de Epona',
  "Zelda's Lullaby": 'Nana de Zelda',
  "Scarecrow's Song": 'Canción del Espantapájaros',
};

const NAME_EXACT = {
  ...areas,
  'Deku Stick Capacity Upgrade': 'Mejora de capacidad de Palos Deku',
  'Deku Nut Capacity Upgrade': 'Mejora de capacidad de Nueces Deku',
  'Deku Seed Bag Upgrade': 'Mejora de bolsa de Semillas Deku',
  'Magic Beans': 'Frijoles mágicos',
  'Gerudo Membership Card': 'Tarjeta de miembro Gerudo',
  'Zelda’s Letter': 'Carta de Zelda',
  'Stone of Agony': 'Piedra de la Agonía',
  'Giant’s Wallet': 'Bolsa de gigante',
  'Adult’s Wallet': 'Bolsa de adulto',
  'Claim Check': 'Recibo de Biggoron',
  'World’s Finest Eye Drops': 'Las mejores gotas para los ojos',
  'Eyeball Frog': 'Rana de ojos',
  Prescription: 'Receta médica',
  'Broken Goron’s Sword': 'Espada Goron rota',
  'Poacher’s Saw': 'Sierra del cazador furtivo',
  'Odd Potion': 'Poción extraña',
  'Odd Mushroom': 'Hongo extraño',
  Cojiro: 'Cojiro',
  'Pocket Egg': 'Huevo de bolsillo',
  'Ocarina of Time': 'Ocarina del Tiempo',
  'Fairy Ocarina': 'Ocarina de las hadas',
  'Fire Arrows': 'Flechas de fuego',
  'Light Arrows': 'Flechas de luz',
  'Master Sword': 'Espada Maestra',
  'Nayru’s Love': 'Amor de Nayru',
  'Farore’s Wind': 'Viento de Farore',
  'Din’s Fire': 'Fuego de Din',
  'Double Defense': 'Defensa doble',
  'Double Magic': 'Magia doble',
  'Magic Meter': 'Medidor de magia',
  'Bomb Bag Upgrade': 'Mejora de Saco de bombas',
  'Quiver Upgrade': 'Mejora de Carcaj',
  'Golden Scale': 'Escama de oro',
  'Silver Scale': 'Escama de plata',
  'Zora Tunic': 'Túnica Zora',
  'Goron Tunic': 'Túnica Goron',
  'Goron’s Bracelet': 'Brazalete de Goron',
  'Giant’s Knife': 'Cuchillo de gigante',
  'Biggoron’s Sword': 'Espada de Biggoron',
  'Zora Mask': 'Máscara Zora',
  'Gerudo Mask': 'Máscara Gerudo',
  'Mask of Truth': 'Máscara de la Verdad',
  'Bunny Hood': 'Capucha de conejo',
  'Keaton Mask': 'Máscara Keaton',
  'Hylian Shield': 'Escudo hyliano',
  'Skull Mask': 'Máscara Calavera',
  'Goron Mask': 'Máscara Goron',
  'Spooky Mask': 'Máscara Tenebrosa',
  'Deku Shield': 'Escudo Deku',
  'Fairy Thought': 'Pensamiento de hada',
  'Bottle - Talon': 'Botella - Talon',
  'Bottle - Poe Collector': 'Botella - Coleccionista de Poes',
  'Bottle - Market': 'Botella - Mercado',
  'Bottle - Cucco Lady': 'Botella - Chica de los Cuccos',
  'Bottle - Letter': 'Botella - Carta',
  Cow: 'Vaca',
  "Cow - Link's House": 'Vaca - Casa de Link',
  'Business Scrub': 'Mercader Deku',
  'Magic Bean Spot': 'Tierra para frijoles mágicos',
  'Gossip Stone': 'Piedra cotilla',
  'Silver Rupee': 'Rupia plateada',
  'Kaepora Gaebora': 'Kaepora Gaebora',
  'Inside Ganon\'s Castle Entrance': 'Entrada al Castillo de Ganon',
  'Ice Cavern Entrance': 'Entrada a la Caverna de Hielo',
  'Fire Temple Entrance': 'Entrada al Templo del Fuego',
  "Dodongo's Cavern Entrance": 'Entrada a la Caverna de Dodongo',
  'Bottom of the Well Entrance': 'Entrada al Fondo del Pozo',
  'Spirit Temple Entrance': 'Entrada al Templo del Espíritu',
  'Shadow Temple Entrance': 'Entrada al Templo de las Sombras',
  "Inside Jabu-Jabu's Belly Entrance": 'Entrada al Interior de Jabu-Jabu',
  'Forest Temple Entrance': 'Entrada al Templo del Bosque',
  'Water Temple Entrance': 'Entrada al Templo del Agua',
  'Inside the Deku Tree Entrance': 'Entrada al Interior del Árbol Deku',
  'Carpenter Jiro': 'Carpintero Jiro',
  'Carpenter Shiro': 'Carpintero Shiro',
  'Carpenter Ichiro': 'Carpintero Ichiro',
  'Carpenter Saburo': 'Carpintero Saburo',
  'Running Man': 'Corredor',
  'House of Skulltula': 'Casa de los Skulltula',
  'Bean Seller': 'Vendedor de frijoles',
  'Skull Kid': 'Skull Kid',
  "Dampé's Race": 'Carrera contra Dampé',
  'Kakariko Shooting Gallery': 'Galería de tiro de Kakariko',
  'Gerudo Proving Grounds': 'Centro de Entrenamiento Gerudo',
  'Horseback Archery': 'Tiro con arco a caballo',
  'Horse Race': 'Carrera de caballos',
  'Shooting Gallery': 'Galería de tiro',
  'Bombchu Bowling Alley': 'Bolera Bombchu',
  'Treasure Chest Game': 'Juego de los cofres',
  'Grave-Digging Tour': 'Excavación nocturna de Dampé',
  'Gossip Quest Rumor #65 - Frogs': 'Rumor #65 - Ranas',
  'Diving Game': 'Juego de buceo',
  'Super Cucco Game': 'Juego de los Súper Cuccos',
  'Forest Stage': 'Escenario del bosque',
  'Fishing Pond': 'Estanque de pesca',
  'Great Fairy of Courage': 'Gran Hada del Valor',
  'Great Fairy of Wisdom': 'Gran Hada de la Sabiduría',
  'Great Fairy of Din': 'Gran Hada de Din',
  'Great Fairy of Power': 'Gran Hada del Poder',
  'Great Fairy of Nayru': 'Gran Hada de Nayru',
  'Great Fairy of Farore': 'Gran Hada de Farore',
  'Kakariko Bazaar': 'Bazar de Kakariko',
  'Kakariko Potion Shop': 'Tienda de pociones de Kakariko',
  "Granny's Potion Shop": 'Tienda de pociones de la Abuela',
  'Ghost Shop': 'Tienda de fantasmas',
  'Goron Shop': 'Tienda Goron',
  'Happy Mask Shop': 'Tienda de la Máscara Feliz',
  'Potion Shop': 'Tienda de pociones',
  Bazaar: 'Bazar',
  'Bombchu Shop': 'Tienda Bombchu',
  'Zora Shop': 'Tienda Zora',
  'Kokiri Shop': 'Tienda Kokiri',
  Chest: 'Cofre',
  'Boss Key Chest': 'Cofre de la Llave del Jefe',
  'Big Poe - Hill South of Kokiri Forest': 'Gran Poe - Colina al sur del Bosque Kokiri',
  'Big Poe - Southwest of the Ranch': 'Gran Poe - Suroeste del Rancho',
  'Big Poe - Lake Hylia Wetlands': 'Gran Poe - Humedales del Lago Hylia',
  'Big Poe - South of the Ranch': 'Gran Poe - Sur del Rancho',
  'Big Poe - West of the Ranch': 'Gran Poe - Oeste del Rancho',
  'Big Poe - Gerudo Valley Incline': 'Gran Poe - Pendiente del Valle Gerudo',
  'Big Poe - East of the Ranch': 'Gran Poe - Este del Rancho',
  'Big Poe - Ranch Road': 'Gran Poe - Camino del Rancho',
  'Big Poe - Castle Moat': 'Gran Poe - Foso del Castillo',
  'Big Poe - Castle Road Sign': 'Gran Poe - Cartel del Camino al Castillo',
};

const LOCATION_SUFFIX_ES = {
  'Scarecrow Ledge': 'Cornisa del Espantapájaros',
  'Boulder Room': 'Sala de la roca',
  Hallway: 'Pasillo',
  'Statue Base': 'Base de la estatua',
  'Silver Diamond Room': 'Sala del rombo plateado',
  'Skull Vase Room': 'Sala de las vasijas calavera',
  Docks: 'Muelle',
  'Fan Room': 'Sala del ventilador',
  'Crusher Room': 'Sala de los pinchos',
  'Scythe Room': 'Sala de las guadañas',
  Waterfall: 'Cascada',
  'Tower Ceiling': 'Techo de la torre',
  River: 'Río',
  'Bombable Wall': 'Pared bombardeable',
  'Under the Tower': 'Bajo la torre',
  'Hammer Rock': 'Roca del martillo',
  'Chest Room': 'Sala del cofre',
  'Scarecrow Room': 'Sala del Espantapájaros',
  'Boulder Maze': 'Laberinto de rocas',
  'Tile Room': 'Sala de baldosas',
  'West Garden': 'Jardín oeste',
  'Twisted Hall': 'Pasillo retorcido',
  'Garden Ledge': 'Cornisa del jardín',
  'Main Hall': 'Salón principal',
  Entrance: 'Entrada',
  'Block Room': 'Sala del bloque',
  'Compass Room': 'Sala de la brújula',
  'Blade Room': 'Sala de las cuchillas',
  'Hidden Path': 'Camino oculto',
  'Locked Room': 'Sala cerrada',
  'Like Like Room': 'Sala del Like Like',
  'Boss Door': 'Puerta del jefe',
  'Octo Hallway': 'Pasillo de Octo',
  'Main Room': 'Sala principal',
  'Map Room': 'Sala del mapa',
  'Bridge Room': 'Sala del puente',
  'Side Room': 'Sala lateral',
  'Stairs Room': 'Sala de las escaleras',
  'Larva Room': 'Sala de las larvas',
  'Basement Bars': 'Rejas del sótano',
  'Basement Vines': 'Enredaderas del sótano',
  Gate: 'Portón',
  'Bean Ride': 'Viaje en frijol',
  'Bug Hole': 'Agujero de insectos',
  'Rock Wall': 'Pared de roca',
  Temple: 'Templo',
  'Horseback Archery Range': 'Campo de tiro a caballo',
  'West Door': 'Puerta oeste',
  "Carpenters' Tent": 'Tienda de los carpinteros',
  "Carpenters' Camp Arch": 'Arco del campamento de carpinteros',
  Bridge: 'Puente',
  'Island Tree': 'Árbol de la isla',
  'Laboratory Tank': 'Tanque del laboratorio',
  'Laboratory Back Wall': 'Pared trasera del laboratorio',
  'Laboratory Bug Hole': 'Agujero del laboratorio',
  'Hidden Cave': 'Cueva oculta',
  Cave: 'Cueva',
  Ruins: 'Ruinas',
  'Golden Tree': 'Árbol dorado',
  "Zora's Domain Entrance": 'Entrada al Dominio Zora',
  Pillar: 'Pilar',
  Centerpiece: 'Estructura central',
  Crate: 'Caja',
  'Entrance Crate': 'Caja de la entrada',
  'Outside Goron City': 'Afuera de Ciudad Goron',
  Summit: 'Cima',
  'Cracked Wall': 'Pared agrietada',
  "Dodongo's Cavern Bug Hole": 'Agujero junto a Caverna de Dodongo',
  "Impa's House Roof": 'Techo de la casa de Impa',
  "Behind Dampé's Hut": 'Detrás de la cabaña de Dampé',
  'House of Skulltula Door': 'Puerta de la Casa de los Skulltula',
  'Death Mountain Gate': 'Portón de la Montaña de la Muerte',
  'Construction Site': 'Obra en construcción',
  Watchtower: 'Torre de vigilancia',
  'Town Tree': 'Árbol del pueblo',
  Tower: 'Torre',
  'House Window': 'Ventana de la casa',
  Tree: 'Árbol',
  'Storm Grotto': 'Gruta de las Tormentas',
  'Courtyard Tree': 'Árbol del patio',
  'Storage House': 'Almacén',
  'Lake Grotto': 'Gruta del lago',
  'Wetland Grotto': 'Gruta del humedal',
  'Lone Tree': 'Árbol solitario',
  'Maze Wall': 'Pared del laberinto',
  'Scrub Bug Hole': 'Agujero de los Mercaderes Deku',
  'House of Twins': 'Casa de las Gemelas',
  'Know-It-All House': 'Casa de los Sabelotodo',
  'Shop Bug Hole': 'Agujero detrás de la tienda',
  'Rock Arch': 'Arco de roca',
  'Horseback Archery': 'Tiro con arco a caballo',
  Rooftop: 'Tejado',
  Ledge: 'Cornisa',
  'Laboratory Rooftop': 'Techo del laboratorio',
  'Lakeside Laboratory Dive': 'Buceo en el laboratorio',
  'Fishing Pond': 'Estanque de pesca',
  Floor: 'Suelo',
  Ice: 'Hielo',
  Torches: 'Antorchas',
  'Frogs Ocarina Game': 'Juego musical de las ranas',
  'Frogs (Song of Storms)': 'Ranas (Canción de las Tormentas)',
  Platform: 'Plataforma',
  'Business Scrub': 'Mercader Deku',
  Volcano: 'Volcán',
  Cliff: 'Acantilado',
  'Spinning Pot': 'Vasija giratoria',
  "Above Dodongo's Cavern": 'Encima de la Caverna de Dodongo',
  "Dampé's Race": 'Carrera de Dampé',
  Grave: 'Tumba',
  "Dampé's Gravedigging": 'Excavación de Dampé',
  'Potion Shop Roof': 'Techo de la tienda de pociones',
  Windmill: 'Molino',
  'House of Skulltula': 'Casa de los Skulltula',
  'Bombchu Bowling': 'Bolera Bombchu',
  'Treasure Chest Shop': 'Juego de los cofres',
  'Lost Dog': 'Perro perdido',
  'Hidden Chest': 'Cofre oculto',
  'Memory Game': 'Juego de memoria',
  'Skull Kid': 'Skull Kid',
};

function translateName(name) {
  if (NAME_EXACT[name]) return NAME_EXACT[name];
  if (ITEMS_ES[name]) return ITEMS_ES[name];
  for (const [prefix, prefixEs] of [
    ['Chest - ', 'Cofre - '],
    ['Large Chest - ', 'Cofre grande - '],
    ['Invisible Chest - ', 'Cofre invisible - '],
    ['Heart Container - ', 'Contenedor de corazón - '],
    ['Warp Pad - ', 'Portal - '],
    ['Boss Door - ', 'Puerta del jefe - '],
  ]) {
    if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length);
      return prefixEs + (ITEMS_ES[rest] || rest);
    }
  }
  for (const [prefix, prefixEs] of [
    ['Gold Skulltula - ', 'Skulltula dorada - '],
    ['Piece of Heart - ', 'Pieza de corazón - '],
  ]) {
    if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length);
      if (LOCATION_SUFFIX_ES[rest]) return prefixEs + LOCATION_SUFFIX_ES[rest];
    }
  }
  return null;
}

const TEXT_EXACT = {
  'Purchase the capacity upgrade from this Business Scrub.':
    'Compra la mejora de capacidad a este Mercader Deku.',
  'Score three perfect hits on the target in the Lost Woods to earn the seed-bag upgrade.':
    'Acierta tres tiros perfectos al blanco en el Bosque Perdido para ganar la mejora de bolsa de semillas.',
  'Buy Magic Beans from the bean seller.':
    'Compra Frijoles mágicos al vendedor de frijoles.',
  'Rescue the imprisoned carpenters to receive the Gerudo Membership Card.':
    'Rescata a los carpinteros prisioneros para recibir la Tarjeta de miembro Gerudo.',
  'Meet Princess Zelda in the castle courtyard.':
    'Reúnete con la Princesa Zelda en el patio del castillo.',
  'Obtained from Zelda in the castle courtyard. Shown at the mapped courtyard approach.':
    'Se obtiene de Zelda en el patio del castillo. Se muestra en el acceso mapeado al patio.',
  'Bring 20 Gold Skulltula Tokens to the family.':
    'Lleva 20 símbolos de Skulltula dorada a la familia.',
  'Bring 30 Gold Skulltula Tokens to the family.':
    'Lleva 30 símbolos de Skulltula dorada a la familia.',
  'Bring 10 Gold Skulltula Tokens to the family.':
    'Lleva 10 símbolos de Skulltula dorada a la familia.',
  'Deliver the eye drops to Biggoron before time runs out.':
    'Entrega las gotas para los ojos a Biggoron antes de que se acabe el tiempo.',
  'Deliver the Eyeball Frog to the Lakeside Laboratory.':
    'Entrega la Rana de ojos en el Laboratorio del Lago.',
  'Show the Prescription to the thawed King Zora.':
    'Muéstrale la receta al Rey Zora descongelado.',
  'Bring the broken sword to Biggoron.':
    'Llévale la espada rota a Biggoron.',
  'Trade the Poacher’s Saw to the carpenter.':
    'Entrega la Sierra del cazador furtivo al carpintero.',
  'Take the Odd Potion back to the Lost Woods.':
    'Lleva la Poción extraña de regreso al Bosque Perdido.',
  'Deliver the Odd Mushroom to the potion maker before time runs out.':
    'Entrega el Hongo extraño en la tienda de pociones antes de que se acabe el tiempo.',
  'Show Cojiro to the man in the Lost Woods.':
    'Muéstrale a Cojiro al hombre del Bosque Perdido.',
  'Return the awakened Pocket Cucco to the Cucco Lady.':
    'Devuelve el Cucco despierto a la Chica de los Cuccos.',
  'Speak to the Cucco Lady as an adult.':
    'Habla con la Chica de los Cuccos siendo adulto.',
  'Recover the ocarina left by Zelda in the water outside the castle town.':
    'Recupera la ocarina que Zelda dejó en el agua a la salida de la Ciudadela.',
  'Receive this ocarina from Saria when leaving Kokiri Forest.':
    'Recibe esta ocarina de Saria al salir del Bosque Kokiri.',
  'Shoot the rising sun from the stone platform at Lake Hylia.':
    'Dispara al sol naciente desde la plataforma de piedra en el Lago Hylia.',
  'Return to the Temple of Time after awakening the sages.':
    'Regresa al Templo del Tiempo tras despertar a los sabios.',
  'Shown at the Temple of Time entrance; the item is obtained inside.':
    'Se muestra en la entrada del Templo del Tiempo; el objeto se obtiene adentro.',
  'Draw the Master Sword from its pedestal inside the Temple of Time.':
    'Saca la Espada Maestra de su pedestal dentro del Templo del Tiempo.',
  'Play Zelda’s Lullaby at the Great Fairy’s fountain and speak to her.':
    'Toca la Nana de Zelda en la fuente de la Gran Hada y habla con ella.',
  'Wear the Mask of Truth for the Forest Stage audience.':
    'Ponte la Máscara de la Verdad frente al público del Escenario del Bosque.',
  'Wear the Skull Mask for the Forest Stage audience.':
    'Ponte la Máscara Calavera frente al público del Escenario del Bosque.',
  'Win the Bomb Bag prize at Bombchu Bowling.':
    'Gana el premio del Saco de bombas en la Bolera Bombchu.',
  'Earn the high-score reward in horseback archery.':
    'Consigue la recompensa por puntuación alta en el tiro con arco a caballo.',
  'Win the adult’s Shooting Gallery game.':
    'Gana el juego de la Galería de tiro como adulto.',
  'Win the child’s Shooting Gallery game.':
    'Gana el juego de la Galería de tiro como niño.',
  'Catch a sufficiently large fish as an adult and show it to the Fishing-Pond Man.':
    'Pesca un pez lo bastante grande siendo adulto y muéstraselo al dueño del estanque.',
  'Win the Diving Game to earn the Silver Scale.':
    'Gana el juego de buceo para conseguir la Escama de plata.',
  'Stop the rolling Goron in the correct place with a bomb. The reward upgrades your Bomb Bag.':
    'Detén al Goron que rueda en el lugar correcto con una bomba. La recompensa mejora tu Saco de bombas.',
  'Thaw King Zora with Blue Fire and speak to him.':
    'Descongela al Rey Zora con Fuego Azul y habla con él.',
  'Stop the rolling Goron and speak to him about the Gorons and the Fire Temple.':
    'Detén al Goron que rueda y habla con él sobre los Goron y el Templo del Fuego.',
  'Play Saria’s Song for Darunia to receive the bracelet.':
    'Toca la Canción de Saria para Darunia y recibirás el brazalete.',
  'Buy this sword from Medigoron.':
    'Compra esta espada a Medigoron.',
  'Complete Biggoron’s trading sequence to receive the repaired sword.':
    'Completa la cadena de intercambios de Biggoron para recibir la espada reparada.',
  'Available from the shop here. Stock and access can depend on story progress.':
    'Disponible en esta tienda. El inventario y acceso pueden depender del avance de la historia.',
  'Inside Dampé’s grave. Shown at the mapped race entrance because the interior is not drawn on the overworld map.':
    'Dentro de la tumba de Dampé. Se muestra en la entrada de la carrera porque el interior no aparece en el mapa general.',
  'Inside Ganon’s Castle. Shown at the entrance because this dungeon does not yet have map artwork.':
    'Dentro del Castillo de Ganon. Se muestra en la entrada porque esta mazmorra aún no tiene mapa propio.',
  'Contains a substitute reward if the equipment is already owned.':
    'Contiene una recompensa alternativa si ya tienes este equipo.',
  'Requires the Lens of Truth to see.':
    'Requiere la Lente de la Verdad para verlo.',
  'Inside the Gerudo Training Ground. Shown at the entrance because this dungeon does not yet have map artwork.':
    'Dentro del Centro de Entrenamiento Gerudo. Se muestra en la entrada porque esta mazmorra aún no tiene mapa propio.',
  'Learn this warp song from Sheik after the burning-village event in Kakariko Village.':
    'Aprende esta canción de teletransporte con Sheik tras el incendio en la Aldea Kakariko.',
  'Play your own tune for the scarecrow at Lake Hylia as a child, then play it again as an adult.':
    'Toca tu propia melodía al espantapájaros del Lago Hylia de niño y vuelve a tocarla de adulto.',
  'Return to the Temple of Time and learn this warp song from Sheik.':
    'Regresa al Templo del Tiempo y aprende esta canción de teletransporte con Sheik.',
  'Shown at the Temple of Time entrance; the lesson takes place inside.':
    'Se muestra en la entrada del Templo del Tiempo; la escena ocurre adentro.',
  'Learn this warp song from Sheik after leaving the Spirit Temple.':
    'Aprende esta canción de teletransporte con Sheik al salir del Templo del Espíritu.',
  'Learn this warp song from Sheik in the Ice Cavern after obtaining the Iron Boots.':
    'Aprende esta canción de teletransporte con Sheik en la Caverna de Hielo tras obtener las Botas de hierro.',
  'Learn this warp song from Sheik in Death Mountain Crater.':
    'Aprende esta canción de teletransporte con Sheik en el Cráter de la Montaña de la Muerte.',
  'Learn this warp song from Sheik in the Sacred Forest Meadow.':
    'Aprende esta canción de teletransporte con Sheik en el Prado Sagrado del Bosque.',
  'Show your ocarina to the music man inside the windmill as an adult.':
    'Muéstrale tu ocarina al músico dentro del molino siendo adulto.',
  'Recover the Ocarina of Time to learn the song from Zelda’s message.':
    'Recupera la Ocarina del Tiempo para aprender la canción del mensaje de Zelda.',
  'Enter the Royal Family’s Tomb and read the inscription to learn this song.':
    'Entra en la Tumba de la Familia Real y lee la inscripción para aprender esta canción.',
  'Shown at the tomb entrance because the interior is not drawn on the overworld map.':
    'Se muestra en la entrada de la tumba porque el interior no está dibujado en el mapa general.',
  'Learn this song from Saria in the Sacred Forest Meadow.':
    'Aprende esta canción de Saria en el Prado Sagrado del Bosque.',
  'Show Malon your ocarina at Lon Lon Ranch to learn her song.':
    'Muéstrale tu ocarina a Malon en el Rancho Lon Lon para aprender su canción.',
  'Impa teaches this song after meeting Princess Zelda.':
    'Impa te enseña esta canción tras conocer a la Princesa Zelda.',
  'Read the fairy’s thoughts at this spot with Navi.':
    'Lee los pensamientos del hada en este punto con Navi.',
  'Inside the Royal Family’s Tomb. Shown at the entrance because the interior is not drawn on this map.':
    'Dentro de la Tumba de la Familia Real. Se muestra en la entrada porque el interior no está dibujado en este mapa.',
  'Read the fairy&rsquo;s thoughts at this spot with Navi:<br><br>"I love to make pretty rupee arrangements! Most especially when I put them floating inside of puddles or down inside holes in the ground...<br><br>I don\'t mind if somebody takes them after I\'ve made my arrangement. I had my fun with the rupees, so let someone else enjoy them!"':
    'Lee los pensamientos del hada en este punto con Navi:<br><br>«¡Me encanta hacer arreglos bonitos de rupias! Sobre todo cuando las dejo flotando dentro de charcos o escondidas en agujeros del suelo...<br><br>No me importa si alguien se las lleva después de armar mi diseño. ¡Ya me divertí con las rupias, que las disfrute otra persona!»',
  "Win Talon's Super Cucco minigame at Lon Lon Ranch for the first time to receive a bottle of milk. Subsequent rewards refill an existing bottle.":
    'Gana por primera vez el minijuego de los Súper Cuccos de Talon en el Rancho Lon Lon para recibir una botella de leche. Las siguientes veces rellenarán una botella vacía.',
  'An empty bottle rewarded by the Poe Collector through the Big Poe exchange.':
    'Una botella vacía entregada por el Coleccionista de Poes al intercambiar Grandes Poes.',
  'Receive an empty bottle during the Market bottle tutorial.':
    'Recibe una botella vacía durante el tutorial de botellas en el Mercado.',
  "Complete the Cucco Lady's Cucco-catching minigame again after the first Red Rupee reward to receive an empty bottle.":
    'Completa otra vez el minijuego de atrapar Cuccos después del primer premio de Rupia roja para recibir una botella vacía.',
  'A bottle containing a letter, found underwater in Lake Hylia.':
    'Una botella con una carta adentro, sumergida en el Lago Hylia.',
  "Play Epona's Song for milk.":
    'Toca la Canción de Epona para obtener leche.',
  "Malon's reward for winning Epona. Play Epona's Song for milk.":
    'Recompensa de Malon por ganar a Epona. Toca la Canción de Epona para obtener leche.',
  'Sells: Piece of Heart.': 'Vende: Pieza de corazón.',
  'Sells: Bombs, Bombchus.': 'Vende: Bombas, Bombchus.',
  'Sells: Deku Seeds, Small Magic Jar.': 'Vende: Semillas Deku, Frasco de magia pequeño.',
  'Sells: Deku Nuts, Bugs, Business Scrub Seed.': 'Vende: Nueces Deku, Insectos, Semilla de Mercader Deku.',
  'Sells: Arrows, Small Magic Jar.': 'Vende: Flechas, Frasco de magia pequeño.',
  'Sells: Deku Nut upgrade.': 'Vende: Mejora de Nueces Deku.',
  'Sells: Recovery Hearts, Small Magic Jar.': 'Vende: Corazones de recuperación, Frasco de magia pequeño.',
  'Sells: Deku Stick upgrade.': 'Vende: Mejora de Palos Deku.',
  'Sells: Green Potion, Small Magic Jar, Business Scrub Seed.': 'Vende: Poción verde, Frasco de magia pequeño, Semilla de Mercader Deku.',
  'Plant a Magic Bean here as a child; as an adult it grows into a platform to ride.':
    'Planta un Frijol mágico aquí de niño; de adulto crecerá como una plataforma voladora.',
  'Release Bugs here to find a Gold Skulltula.':
    'Suelta insectos aquí para hacer salir una Skulltula dorada.',
  'Play the ocarina here for a Fairy Spirit.':
    'Toca la ocarina aquí para invocar un espíritu de hada.',
  'Collect all five in this room to open the way.':
    'Reúne las cinco en esta sala para abrir el camino.',
  'The owl waits here with advice.':
    'El búho espera aquí para darte consejos.',
  'Inside the Temple of Time.': 'Dentro del Templo del Tiempo.',
  'One of the four carpenters imprisoned in Gerudo\'s Fortress.':
    'Uno de los cuatro carpinteros prisioneros en la Fortaleza Gerudo.',
  'Race him across Hyrule Field.':
    'Compite contra él corriendo por la Pradera de Hyrule.',
  'Bring Gold Skulltula Tokens here to lift the family\'s curse, for rewards.':
    'Trae símbolos de Skulltula dorada aquí para romper la maldición de la familia y obtener recompensas.',
  'Sells Magic Beans.': 'Vende Frijoles mágicos.',
  'Plays the ocarina on a stump in the Lost Woods.':
    'Toca la ocarina sobre un tocón en el Bosque Perdido.',
  "Race Dampé's ghost through his grave.":
    'Compite contra el fantasma de Dampé por su tumba.',
  "Kakariko's shooting gallery, played with the Bow.":
    'Galería de tiro de Kakariko, se juega con el Arco.',
  "The Gerudo's training ground, by its attendant.":
    'El centro de entrenamiento Gerudo, junto a su encargada.',
  "Shoot targets from Epona at the Gerudo's Fortress range.":
    'Dispara a los blancos montado en Epona en el campo de la Fortaleza Gerudo.',
  'Race Ingo around Lon Lon Ranch.':
    'Compite en carrera contra Ingo en el Rancho Lon Lon.',
  "The Market's shooting gallery, played with the Slingshot.":
    'Galería de tiro del Mercado, se juega con el Tirachinas.',
  'Bowl Bombchus through the targets for prizes.':
    'Lanza Bombchus hacia los blancos para ganar premios.',
  'Pick the right chests to win a Piece of Heart.':
    'Elige los cofres correctos para ganar una Pieza de corazón.',
  "Dampé's Heart-Pounding Grave-Digging Tour.":
    'El emocionante recorrido de excavación de tumbas de Dampé.',
  'Play songs for the frogs on the log.':
    'Tócales canciones a las ranas sobre el tronco.',
  'Dive for the rupees a Zora throws in.':
    'Bucea para recoger las rupias que lanza el Zora.',
  "Find Talon's Super Cuccos among the others.":
    'Encuentra los Súper Cuccos de Talon entre los demás.',
  "The Deku Scrubs' stage, through a hole in the ground.":
    'El escenario de los Deku, entrando por un agujero en el suelo.',
  "Lake Hylia's fishing pond.": 'El estanque de pesca del Lago Hylia.',
  'Behind the giant pillar, lifted with the Golden Gauntlets.':
    'Detrás del pilar gigante, levantado con los Guanteletes de oro.',
  'Behind a large boulder.': 'Detrás de una gran roca.',
  'Behind a bombable wall.': 'Detrás de una pared bombardeable.',
  'Through the crawlspace behind a bombable wall.':
    'Por el pasadizo estrecho detrás de una pared bombardeable.',
  "Kakariko's general store.": 'La tienda general de Kakariko.',
  "Kakariko's potion shop.": 'La tienda de pociones de Kakariko.',
  'Granny brews potions behind the Kakariko Potion Shop.':
    'La abuela prepara pociones detrás de la tienda de pociones de Kakariko.',
  'The Poe Collector buys Poes and Big Poes in bottles.':
    'El Coleccionista de Poes compra Poes y Grandes Poes en botellas.',
  'Sells bombs and Goron Tunics.': 'Vende bombas y Túnicas Goron.',
  'Lends masks to sell for the shop.': 'Presta máscaras para venderlas por encargo.',
  "The Market's potion shop.": 'La tienda de pociones del Mercado.',
  "The Market's general store.": 'La tienda general del Mercado.',
  'Sells Bombchus.': 'Vende Bombchus.',
  'Sells fish, arrows and Zora Tunics.': 'Vende peces, flechas y Túnicas Zora.',
  'Sells Deku Shields, Deku Nuts, Deku Sticks and more.':
    'Vende Escudos Deku, Nueces Deku, Palos Deku y más.',
  'Holds something else if you already have one.':
    'Contiene otra recompensa si ya tienes uno.',
  'On the hillside just south of the path into Kokiri Forest. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.':
    'En la ladera justo al sur del camino al Bosque Kokiri. Salta con Epona por la zona para hacerlo aparecer, derríbalo con el arco y embotéllalo. Véndelo al Coleccionista de Poes.',
  'Where the dry southwestern part of Hyrule Field meets the grassland, near the ruined tower at Lon Lon Ranch. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.':
    'Donde la parte seca del suroeste de la Pradera se une al pastizal, cerca de la torre en ruinas del Rancho Lon Lon. Salta con Epona, derríbalo y embotéllalo. Véndelo al Coleccionista de Poes.',
  'East of the Lake Hylia entrance, by a fallen tree near the wetlands. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.':
    'Al este de la entrada al Lago Hylia, junto a un árbol caído cerca del humedal. Salta con Epona, derríbalo y embotéllalo. Véndelo al Coleccionista de Poes.',
  'South of Lon Lon Ranch, between the ranch fence and the Deku Scrub woods, by a ghostly branch with a lantern. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.':
    'Al sur del Rancho Lon Lon, entre la cerca y la arboleda Deku, junto a una rama fantasmal con farol. Salta con Epona, derríbalo y embotéllalo. Véndelo al Coleccionista de Poes.',
  "Along the outside of Lon Lon Ranch's western wall, roughly level with the ranch's water tower. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.":
    'Por fuera del muro oeste del Rancho Lon Lon, a la altura de su torre de agua. Salta con Epona, derríbalo y embotéllalo. Véndelo al Coleccionista de Poes.',
  'East of Gerudo Valley, by the low glowing wall on the incline to its entrance. Birds circle nearby. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.':
    'Al este del Valle Gerudo, junto al muro bajo en la subida hacia la entrada (hay aves volando en círculos). Salta con Epona, derríbalo y embotéllalo. Véndelo al Coleccionista de Poes.',
  'By a glowing overturned trunk on the east side of Lon Lon Ranch. Approach from the south. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.':
    'Junto a un tronco caído al este del Rancho Lon Lon. Acércate desde el sur, salta con Epona, derríbalo y embotéllalo. Véndelo al Coleccionista de Poes.',
  'Farther along the Lon Lon Ranch road, near the ranch entrance, by the fence with a purple lantern. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.':
    'Más adelante por el camino al Rancho Lon Lon, cerca de la entrada, junto a la cerca con un farol morado. Salta con Epona, derríbalo y embotéllalo. Véndelo al Coleccionista de Poes.',
  'Along the moat, just right of the Castle Town exit. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.':
    'Junto al foso, apenas a la derecha saliendo de la Ciudadela. Salta con Epona, derríbalo y embotéllalo. Véndelo al Coleccionista de Poes.',
  'Behind the stone Hyrule sign just outside Castle Town, on the road to Lon Lon Ranch. Ride Epona and jump the spot to make it appear, then shoot it down and bottle it. Sell it to the Poe Collector in Castle Town.':
    'Detrás del cartel de piedra de Hyrule saliendo de la Ciudadela rumbo al Rancho Lon Lon. Salta con Epona, derríbalo y embotéllalo. Véndelo al Coleccionista de Poes.',
  'On the ledge by the Scarecrow in the Colossus room.': 'En la cornisa junto al Espantapájaros en la sala del Coloso.',
  'In the northwest nook of the rolling boulder room.': 'En el rincón noroeste de la sala de la roca rodante.',
  'Above the door in the hallway.': 'Encima de la puerta en el pasillo.',
  'At the base of the statue in the Colossus room.': 'En la base de la estatua de la sala del Coloso.',
  'In the silver diamond room.': 'En la sala del rombo plateado.',
  'In the spinning skull vase room.': 'En la sala de las vasijas calavera giratorias.',
  'Left of the Scarecrow at the docks.': 'A la izquierda del Espantapájaros en el muelle.',
  'On the wall of the bottomless pit in the fan room.': 'En la pared del abismo en la sala del ventilador.',
  'In the northeast corner of the spike crusher room.': 'En la esquina noreste de la sala de los pinchos.',
  'On the back wall of the invisible scythe room.': 'En la pared del fondo de la sala de guadañas invisibles.',
  'Behind the waterfall in the boss key hallway.': 'Detrás de la cascada en el pasillo de la Llave del jefe.',
  'In a ceiling corner of the central tower.': 'En una esquina del techo de la torre central.',
  'At an underwater bend of the whirlpool river.': 'En una curva submarina del río con remolinos.',
  'Under the central tower, past the gate.': 'Debajo de la torre central, pasando la reja.',
  'Behind the rock in the second flying-tile room.': 'Detrás de la roca en la segunda sala de baldosas voladoras.',
  'On the wall of the treasure chest room.': 'En la pared de la sala del cofre.',
  'On the upper wall of the Scarecrow room.': 'En la parte alta de la pared en la sala del Espantapájaros.',
  'In the northeast corner of the boulder maze.': 'En la esquina noreste del laberinto de rocas.',
  'On the back wall of the first flying-tile room.': 'En la pared trasera de la primera sala de baldosas voladoras.',
  'On the balcony of the west garden.': 'En el balcón del jardín oeste.',
  'In the twisted room outside the boss room.': 'En la sala retorcida antes de la sala del jefe.',
  'On the ledge above the garden.': 'En la cornisa sobre el jardín.',
  'By the north stairs in the main hall.': 'Junto a las escaleras norte del salón principal.',
  'At the top of the vine tree at the entrance.': 'En lo alto del árbol de enredaderas de la entrada.',
  'On the wall above the west block room.': 'En la pared sobre la sala del bloque oeste.',
  'On the ice column in the compass room.': 'En la columna de hielo de la sala de la brújula.',
  'On the wall left of the door in the spinning blade room.': 'En la pared a la izquierda de la puerta en la sala de las cuchillas.',
  'Along the hidden path in the second locked room.': 'Por el camino oculto de la segunda sala cerrada.',
  'On the back-left wall of the first locked room.': 'En la pared trasera izquierda de la primera sala cerrada.',
  'On the east wall of the Like Like room.': 'En la pared este de la sala del Like Like.',
  'On the column outside the boss room.': 'En la columna afuera de la sala del jefe.',
  'In the hallway toward Big Octo.': 'En el pasillo hacia Big Octo.',
  'On the north wall of the main room.': 'En la pared norte de la sala principal.',
  'On the vines across from the map chest.': 'En las enredaderas frente al cofre del mapa.',
  'On the ledge above the Baby Dodongo hallway.': 'En la cornisa sobre el pasillo de los Dodongo bebé.',
  'In the side chamber of the block room.': 'En la cámara lateral de la sala del bloque.',
  'In the room beside the suspension bridge.': 'En la sala junto al puente colgante.',
  'In the side room behind a cracked wall.': 'En la sala lateral detrás de una pared agrietada.',
  'On the wall of the Bomb Flower staircase room.': 'En la pared de la sala de la escalera con Flores Bomba.',
  'On the vines in the side room off the Gohma larva room.': 'En las enredaderas de la sala lateral junto a las larvas de Gohma.',
  'Behind the bars left of the switch.': 'Detrás de las rejas a la izquierda del interruptor.',
  'On the vine wall after dropping through the web.': 'En la pared de enredaderas tras caer por la telaraña.',
  'On the wall of the compass room.': 'En la pared de la sala de la brújula.',
  "By the ruined gate outside Ganon's Castle.": 'Junto al portón en ruinas afuera del Castillo de Ganon.',
  'Ride the Magic Bean flower to the second rock. Only at night.':
    'Viaja en la flor del Frijol mágico hasta la segunda roca. Solo de noche.',
  'In the bug hole left of the Spirit Temple entrance.':
    'En el agujero de insectos a la izquierda de la entrada al Templo del Espíritu.',
  'On the rock wall north of the Spirit Temple. Only at night.':
    'En la pared rocosa al norte del Templo del Espíritu. Solo de noche.',
  'In the lower chamber of the abandoned temple in the desert.':
    'En la cámara inferior del templo abandonado en el desierto.',
  'By the farthest target of the horseback archery range. Only at night.':
    'Junto al blanco más lejano del campo de tiro a caballo. Solo de noche.',
  'In the gap by the door on the west side of the fortress. Only at night.':
    'En el hueco junto a la puerta del lado oeste de la fortaleza. Solo de noche.',
  "On the wall behind the carpenters' tent. Only at night.":
    "En la pared detrás de la tienda de los carpinteros. Solo de noche.",
  "On the arch column at the carpenters' camp. Only at night.":
    'En la columna del arco del campamento de carpinteros. Solo de noche.',
  'In the bug hole near the Gerudo guard.': 'En el agujero de insectos cerca de la guardia Gerudo.',
  'Under the plank bridge at the valley entrance. Only at night.':
    'Debajo del puente de tablones en la entrada del valle. Solo de noche.',
  'At the top of the tree on the central island. Only at night.':
    'En la copa del árbol de la isla central. Solo de noche.',
  "In a crate at the bottom of the laboratory's dive tank.":
    'Dentro de una caja en el fondo del tanque de buceo del laboratorio.',
  'On the back wall by the laboratory bridge. Only at night.':
    'En la pared trasera junto al puente del laboratorio. Solo de noche.',
  'In the bug hole by the Lakeside Laboratory door.':
    'En el agujero de insectos junto a la puerta del Laboratorio del Lago.',
  'In the hidden cave past the hole guarded by Tektites.':
    'En la cueva oculta pasando el agujero custodiado por Tektites.',
  'On the top vines of the hidden Skulltula cave. Only at night.':
    'En las enredaderas superiores de la cueva oculta de las Skulltulas. Solo de noche.',
  'On the wall across from the ramp by the ruins. Only at night.':
    'En la pared frente a la rampa junto a las ruinas. Solo de noche.',
  'In the tree outside the Great Fairy Fountain.':
    'En el árbol afuera de la Fuente de la Gran Hada.',
  'At the top of the waterfall, left of the diving game.':
    'En lo alto de la cascada, a la izquierda del juego de buceo.',
  'Ride the Magic Bean flower in the middle of the river. Only at night.':
    'Sube a la flor del Frijol mágico en medio del río. Solo de noche.',
  "On the northwest wall by the Zora's Domain entrance. Only at night.":
    'En la pared noroeste junto a la entrada al Dominio Zora. Solo de noche.',
  'Behind the stone column at the end of the river. Only at night.':
    'Detrás de la columna de piedra al final del río. Solo de noche.',
  'In the bug hole by the Magic Bean seller. New in the remake.':
    'En el agujero de insectos junto al vendedor de Frijoles mágicos. Nuevo en el remake.',
  'On the suspended centerpiece in the middle of the city.':
    'En la estructura colgante en el centro de la ciudad.',
  'In a crate on the top floor, past the rock maze.':
    'Dentro de una caja en el piso superior, pasando el laberinto de rocas.',
  'In the bug hole by the warp pad.': 'En el agujero de insectos junto al portal.',
  "Break the far crate in the crater's entranceway.":
    'Rompe la caja del fondo en la entrada del cráter.',
  'Smash the cliffside rock outside Goron City.':
    'Destroza la roca del acantilado afuera de Ciudad Goron.',
  'Smash the rock near Biggoron at the top of the trail.':
    'Destroza la roca cerca de Biggoron en la cima del sendero.',
  "Bomb the cracked wall on the trail between Kakariko and Dodongo's Cavern.":
    'Vuela la pared agrietada en el sendero entre Kakariko y la Caverna de Dodongo.',
  "In the bug hole just outside Dodongo's Cavern. Clear the boulder with a Bomb Flower.":
    'En el agujero de insectos justo afuera de la Caverna de Dodongo. Despeja la roca con una Flor Bomba.',
  "On the wall by the roof of Impa's house.":
    'En la pared junto al techo de la casa de Impa.',
  "On the fence wall behind Damp&eacute;'s hut. Only at night.":
    'En el muro de la cerca detrás de la cabaña de Dampé. Solo de noche.',
  'In the graveyard bug hole by the tree.':
    'En el agujero de insectos junto al árbol del cementerio.',
  "On the wall left of the House of Skulltula's door. Only at night.":
    'En la pared a la izquierda de la puerta de la Casa de los Skulltula. Solo de noche.',
  'Behind the house next to the Death Mountain gate. Only at night.':
    'Detrás de la casa junto al portón de la Montaña de la Muerte. Solo de noche.',
  'On the construction site wall by the Cucco pen. Only at night.':
    'En la pared de la obra junto al corral de los Cuccos. Solo de noche.',
  'On the side of the watchtower. Only at night.':
    'En el costado de la torre de vigilancia. Solo de noche.',
  "In the tree in the middle of town, near the foreman's son. Only at night.":
    'En el árbol del centro del pueblo, cerca del hijo del capataz. Solo de noche.',
  'On the vines of the ruined tower. Only at night.':
    'En las enredaderas de la torre en ruinas. Solo de noche.',
  "On the front window of Malon's house. Only at night.":
    'En la ventana delantera de la casa de Malon. Solo de noche.',
  "In the tree behind Malon's house.":
    'En el árbol detrás de la casa de Malon.',
  'Play the Song of Storms near the castle to open a hole, then bomb the wall inside.':
    'Toca la Canción de las Tormentas cerca del castillo para abrir un agujero y bombardea la pared interior.',
  'Roll into the tree in the first courtyard outside Hyrule Castle.':
    'Rueda contra el árbol del primer patio afuera del Castillo de Hyrule.',
  'Break the crate in the storage house in Castle Town.':
    'Rompe la caja dentro del almacén en la Ciudadela.',
  'Bomb open the hole west of the Lake Hylia entrance.':
    'Abre con bomba el agujero al oeste de la entrada al Lago Hylia.',
  'Bomb open the hole in the southeast wetland and look inside.':
    'Abre con bomba el agujero del humedal sureste y busca adentro.',
  'In the lone tree west of the Kokiri Forest entrance.':
    'En el árbol solitario al oeste de la entrada al Bosque Kokiri.',
  'On the wall above the Moblin maze.': 'En la pared sobre el laberinto de Moblins.',
  'Ride the Magic Bean flower in the Lost Woods meadow.':
    'Viaja en la flor del Frijol mágico en el prado del Bosque Perdido.',
  'In the bug hole in the Deku Scrub clearing.':
    'En el agujero de insectos del claro de los Deku.',
  'In a soft-soil bug hole in the Lost Woods.':
    'En un agujero de tierra blanda en el Bosque Perdido.',
  'On the wall behind the House of Twins. Only at night.':
    'En la pared detrás de la Casa de las Gemelas. Solo de noche.',
  "On the tree trunk behind the Know-It-All Brothers' house. Only at night.":
    'En el tronco detrás de la casa de los Hermanos Sabelotodo. Solo de noche.',
  'In the soft-soil bug hole behind the Kokiri Shop. Release bugs to draw it out.':
    'En el agujero detrás de la Tienda Kokiri. Suelta insectos para hacerla salir.',
  'On the rock arch near the Spirit Temple. Plant a Magic Bean as Young Link and ride the flower as Adult Link.':
    'Sobre el arco de roca cerca del Templo del Espíritu. Planta un Frijol mágico de niño y súbete a la flor de adulto.',
  'Score 1,000 points or more in the Gerudo horseback archery game.':
    'Consigue 1.000 puntos o más en el tiro con arco a caballo Gerudo.',
  "In a chest on the fortress's highest roof.":
    'En un cofre sobre el techo más alto de la fortaleza.',
  'Behind the waterfall: drop to the ledge below and follow the path north.':
    'Detrás de la cascada: déjate caer a la cornisa inferior y sigue el sendero hacia el norte.',
  'On a small ledge on the far cliff, left of the bridge. Glide over with a Cucco.':
    'En una pequeña cornisa del acantilado lejano, a la izquierda del puente. Planea hasta allí con un Cucco.',
  'On top of the laboratory tower. Ride the Magic Bean flower planted outside.':
    'En lo alto de la torre del laboratorio. Sube en la flor del Frijol mágico plantado afuera.',
  'Dive to the bottom of the laboratory tank, then talk to the scientist.':
    'Bucea hasta el fondo del tanque del laboratorio y luego habla con el científico.',
  'Catch a big fish (about 55 cm or more) in the Fishing Pond and show it to the owner.':
    'Pesca un pez grande (de unos 55 cm o más) en el Estanque de pesca y muéstraselo al dueño.',
  'On the bottom of the fountain near the Ice Cavern entrance.':
    'En el fondo de la fuente, cerca de la entrada a la Caverna de Hielo.',
  'On the farthest of the floating ice platforms in the frozen fountain.':
    'Sobre la más lejana de las plataformas de hielo flotantes en la fuente helada.',
  'Light every torch around the waterfall to make a chest appear.':
    'Enciende todas las antorchas alrededor de la cascada para hacer aparecer un cofre.',
  "Win the frogs' ocarina game after growing all five frogs with your songs.":
    'Gana el juego musical de las ranas tras hacer crecer a las cinco con tus canciones.',
  'Play the Song of Storms to the frogs on the log.':
    'Toca la Canción de las Tormentas a las ranas sobre el tronco.',
  'On a high ledge near the waterfall at the top of the river. Carry the Cucco up and glide across.':
    'En una cornisa alta junto a la cascada al inicio del río. Sube con el Cucco y planea hasta allí.',
  'On a raised platform partway up the river. Glide there with the Cucco from the Hyrule Field end.':
    'En una plataforma elevada a mitad del río. Planea allí con el Cucco desde el extremo de la Pradera de Hyrule.',
  'Buy it from the Business Scrub on the lower ledge on the left.':
    'Cómprala al Mercader Deku de la cornisa inferior izquierda.',
  'Plant a Magic Bean by the warp pad as Young Link, then ride the flower as Adult Link to the piece in the smoke.':
    'Planta un Frijol mágico junto al portal de niño y sube en la flor de adulto hasta la pieza en el humo.',
  'Climb down the netting on the cliff straight ahead as you enter the crater from the trail.':
    'Baja por la pared escalable del acantilado justo frente a ti al entrar al cráter desde el sendero.',
  'Light the torches around the big pot, then drop a lit bomb into it from above to stop it on the right face.':
    'Enciende las antorchas alrededor de la gran vasija y lanza una bomba desde arriba para detenerla en la cara correcta.',
  "In an opening above the Dodongo's Cavern entrance. Ride the Magic Bean flower planted just outside.":
    'En una abertura sobre la entrada a la Caverna de Dodongo. Sube en la flor del Frijol mágico plantado afuera.',
  'Race Dampé through his tomb again and finish in under a minute.':
    'Vuelve a correr contra Dampé por su tumba y termina en menos de un minuto.',
  'On the high ruins in the graveyard. Plant a Magic Bean in the soil there as Young Link and ride the flower as Adult Link.':
    'En las ruinas altas del cementerio. Planta allí un Frijol mágico de niño y súbete a la flor de adulto.',
  'Pull back the southernmost tombstone in the right-hand row at night and drop in. The chest is right there, with no song or enemies needed.':
    'Tira hacia atrás de la lápida más al sur de la fila derecha de noche y baja. El cofre está allí mismo, sin canciones ni enemigos.',
  "At night, pay Dampé to dig in the graveyard's soft soil until he turns up something hard.":
    'De noche, págale a Dampé para que excave en la tierra blanda del cementerio hasta desenterrar algo duro.',
  'On the rooftop where Kaepora Gaebora drops you after flying you down from Death Mountain.':
    'En el tejado donde te deja Kaepora Gaebora al bajar volando desde la Montaña de la Muerte.',
  'Talk to the man sitting on the blue roof by the windmill. Glide over with a Cucco, or Hookshot onto the vines.':
    'Habla con el hombre sentado en el techo azul junto al molino. Planea con un Cucco o usa el Gancho en las enredaderas.',
  'On the ledge inside the windmill, reached from the turning platform.':
    'En la cornisa dentro del molino, alcanzable desde la plataforma giratoria.',
  'Reward for bringing 50 Gold Skulltula Tokens to the cursed family in the House of Skulltula.':
    'Recompensa por llevar 50 símbolos de Skulltula dorada a la familia maldita en la Casa de los Skulltula.',
  'One of the Bombchu Bowling Alley prizes.': 'Uno de los premios de la Bolera Bombchu.',
  'A prize in the Treasure Chest Shop game, open at night. The Lens of Truth makes it easy.':
    'Premio del Juego de los cofres, abierto de noche. La Lente de la Verdad lo hace fácil.',
  'At night, find the white dog Richard in Castle Town and bring him back to his owner in the back alley.':
    'De noche, encuentra al perro blanco Richard en la Ciudadela y devuélveselo a su dueña en el callejón trasero.',
  'A chest under large rocks near the Gerudo Valley arch. Read the Fairy Note as Adult Link, then collect it as Young Link.':
    'Un cofre bajo grandes rocas cerca del arco del Valle Gerudo. Lee el Pensamiento de hada de adulto y recógelo de niño.',
  'Blow open the hidden hole just outside Castle Town and buy it from the Business Scrub. As an adult, he will have already sold the Piece of Heart. A Fairy Note on the tree gives the password, which can be used to buy the Piece of Heart as Young Link.':
    'Abre con bomba el agujero oculto afuera de la Ciudadela y cómprala al Mercader Deku. De adulto ya la habrá vendido. Un Pensamiento de hada en el árbol da la contraseña para comprarla de niño.',
  'Inside the ranch tower: move the crates and crawl through the gap to a hidden room.':
    'Dentro de la torre del rancho: mueve las cajas y pasa por el hueco hacia una sala oculta.',
  "Beat the Skull Kids' ocarina memory game three rounds in a row, near the target tree.":
    'Gana tres rondas seguidas del juego de memoria de los Skull Kids, cerca del árbol del blanco.',
  "Stand on the stump near the Kokiri Forest entrance and play Saria's Song for the Skull Kid.":
    'Párate sobre el tocón cerca de la entrada al Bosque Kokiri y tócale la Canción de Saria al Skull Kid.',
};

const NEEDS_MAP = {
  'Boss Key': 'Llave del jefe',
  'Lens of Truth': 'Lente de la Verdad',
  'Epona, Fairy Bow, an empty bottle': 'Epona, Arco de las hadas, una botella vacía',
  "Scarecrow's Song, Hookshot": 'Canción del Espantapájaros, Gancho',
  'Song of Time': 'Canción del Tiempo',
  Boomerang: 'Bumerán',
  Bombs: 'Bombas',
  "Scarecrow's Song, Longshot": 'Canción del Espantapájaros, Supergancho',
  'Hover Boots, Iron Boots, Longshot': 'Botas voladoras, Botas de hierro, Supergancho',
  Longshot: 'Supergancho',
  'Iron Boots, Bombs': 'Botas de hierro, Bombas',
  'Iron Boots, Hookshot': 'Botas de hierro, Gancho',
  'Megaton Hammer': 'Martillo Megatón',
  Hookshot: 'Gancho',
  'Lens of Truth, Deku Stick': 'Lente de la Verdad, Palo Deku',
  'Small Key': 'Llave pequeña',
  'Boomerang or Fairy Slingshot': 'Bumerán o Tirachinas de las hadas',
  'Fairy Slingshot': 'Tirachinas de las hadas',
  'Deku Stick, Fairy Slingshot': 'Palo Deku, Tirachinas de las hadas',
  'Magic Bean': 'Frijol mágico',
  'Bugs in a bottle, Requiem of Spirit': 'Insectos en botella, Réquiem del Espíritu',
  'Gerudo Pass': 'Tarjeta Gerudo',
  'Bugs in a bottle': 'Insectos en botella',
  'Iron Boots, Zora Tunic, Hookshot': 'Botas de hierro, Túnica Zora, Gancho',
  'Silver Gauntlets, Lens of Truth': 'Guanteletes de plata, Lente de la Verdad',
  'Magic Bean, Hookshot': 'Frijol mágico, Gancho',
  'Bugs in a bottle, Bolero of Fire': 'Insectos en botella, Bolero del Fuego',
  'Song of Storms, Boomerang, Bombs': 'Canción de las Tormentas, Bumerán, Bombas',
  'Bombs, Hookshot': 'Bombas, Gancho',
  'Magic Bean, Requiem of Spirit': 'Frijol mágico, Réquiem del Espíritu',
  'Epona, Fairy Bow': 'Epona, Arco de las hadas',
  "Longshot, or Hookshot with the Scarecrow's Song": 'Supergancho, o Gancho con la Canción del Espantapájaros',
  Cucco: 'Cucco',
  'Golden Scale': 'Escama de oro',
  '20 Rupees': '20 Rupias',
  'Iron Boots, Zora Tunic': 'Botas de hierro, Túnica Zora',
  'Deku Stick': 'Palo Deku',
  "All the songs you've learned": 'Todas las canciones aprendidas',
  'Song of Storms': 'Canción de las Tormentas',
  '100 Rupees': '100 Rupias',
  'Magic Bean, Bolero of Fire': 'Frijol mágico, Bolero del Fuego',
  'Bombs or a Bomb Flower': 'Bombas o Flor Bomba',
  'Cucco or Hookshot': 'Cucco o Gancho',
  "Hookshot (from Dampé's race)": 'Gancho (de la carrera de Dampé)',
  '50 Gold Skulltula Tokens': '50 símbolos de Skulltula dorada',
  'Bombchus, 30 Rupees per game': 'Bombchus, 30 Rupias por partida',
  '10 Rupees per game': '10 Rupias por partida',
  '10 Rupees per dig': '10 Rupias por excavación',
  'Fairy Note': 'Pensamiento de hada',
  'Bombs, 100 Rupees': 'Bombas, 100 Rupias',
  'Fairy Ocarina': 'Ocarina de las hadas',
  "Fairy Ocarina, Saria's Song": 'Ocarina de las hadas, Canción de Saria',
};

function translateParagraph(inner) {
  if (TEXT_EXACT[inner]) return TEXT_EXACT[inner];
  let m;
  if ((m = /^Contains:\s*(.+)\.$/.exec(inner))) {
    const item = ITEMS_ES[m[1]] || m[1];
    return `Contiene: ${item}.`;
  }
  if ((m = /^Contains the (.+)\.$/.exec(inner))) {
    const item = ITEMS_ES[m[1]] || m[1];
    return `Contiene la ${item}.`;
  }
  if ((m = /^Appears after you defeat (.+)\.$/.exec(inner))) {
    const boss = ITEMS_ES[m[1]] || m[1];
    return `Aparece tras derrotar a ${boss}.`;
  }
  if ((m = /^Play the (.+) to warp here\.$/.exec(inner))) {
    const song = ITEMS_ES[m[1]] || m[1];
    return `Toca ${song} para teletransportarte aquí.`;
  }
  if ((m = /^The way into (.+)\.$/.exec(inner))) {
    const dest = areas[m[1]] || m[1];
    return `Acceso hacia ${dest}.`;
  }
  if ((m = /^<strong>Needs:<\/strong>\s*(.+)$/.exec(inner))) {
    return `<strong>Requiere:</strong> ${NEEDS_MAP[m[1]] || m[1]}`;
  }
  if (inner === '<em>Young Link</em>') return '<em>Link niño</em>';
  if (inner === '<em>Adult Link</em>') return '<em>Link adulto</em>';
  if (inner === '<em>Young or Adult Link</em>') return '<em>Link niño o adulto</em>';
  if (inner === '<em>Adult Link, then Young Link</em>') return '<em>Link adulto, luego Link niño</em>';
  return null;
}

function translateText(html) {
  if (!html) return '';
  let ok = true;
  const out = html.replace(/<p>([\s\S]*?)<\/p>/g, (_full, inner) => {
    const tr = translateParagraph(inner.trim());
    if (tr == null) ok = false;
    return `<p>${tr ?? inner}</p>`;
  });
  return ok ? out : null;
}

const [catsRaw, mapsRaw, markersRaw] = await Promise.all([
  readFile(path.join(data, 'categories.json'), 'utf8').then(JSON.parse),
  readFile(path.join(data, 'maps.json'), 'utf8').then(JSON.parse),
  readFile(path.join(data, 'markers.json'), 'utf8').then(JSON.parse),
]);

const missing = { categories: [], maps: [], areas: [], names: [], texts: [] };

const outCats = {};
for (const c of catsRaw) {
  const tr = categories[c.name];
  if (!tr) missing.categories.push(c.name);
  else outCats[c.name] = tr;
}

const outMaps = {};
const outSubmaps = {};
for (const mp of mapsRaw) {
  const tr = maps[mp.name];
  if (!tr) missing.maps.push(mp.name);
  else outMaps[mp.name] = tr;
  for (const sub of mp.subMap) {
    outSubmaps[sub.name] = translateSubmap(sub.name);
  }
}

const outAreas = {};
for (const m of markersRaw) {
  if (m.area) {
    if (!areas[m.area]) missing.areas.push(m.area);
    else outAreas[m.area] = areas[m.area];
  }
}

const outNames = {};
const outTexts = {};
for (const m of markersRaw) {
  if (m.name && !outNames[m.name]) {
    const tr = translateName(m.name);
    if (!tr) missing.names.push(m.name);
    else outNames[m.name] = tr;
  }
  if (m.text && !outTexts[m.text]) {
    const tr = translateText(m.text);
    if (!tr) missing.texts.push(m.text);
    else outTexts[m.text] = tr;
  }
}

if (Object.values(missing).some((arr) => arr.length > 0)) {
  console.error('MISSING TRANSLATIONS:', JSON.stringify(missing, null, 2));
  process.exit(1);
}

await writeFile(
  path.join(data, 'es.json'),
  JSON.stringify({ categories: outCats, maps: outMaps, submaps: outSubmaps, areas: outAreas, names: outNames, texts: outTexts }),
);

console.log(
  `es.json ok: cats=${Object.keys(outCats).length} maps=${Object.keys(outMaps).length} submaps=${Object.keys(outSubmaps).length} areas=${Object.keys(outAreas).length} names=${Object.keys(outNames).length} texts=${Object.keys(outTexts).length}`,
);
