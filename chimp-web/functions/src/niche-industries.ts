/**
 * Curated list of 100+ hyper-specific niche industries for OSHA compliance blog generation.
 * Each industry includes common hazards, relevant OSHA standards, and SEO keywords.
 */

export interface NicheIndustry {
  id: string;
  name: string;
  hazards: string[];
  oshaStandards: string[];
  keywords: string[];
  parentCategory: string;
}

export const NICHE_INDUSTRIES: NicheIndustry[] = [
  // WOODWORKING & FURNITURE
  {
    id: 'cabinet-making-shops',
    name: 'Cabinet Making Shops',
    hazards: ['wood dust exposure', 'machinery hazards', 'noise exposure', 'finishing chemical fumes', 'fire hazards'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1910.95', '29 CFR 1910.1200', '29 CFR 1910.212'],
    keywords: ['cabinet shop OSHA', 'cabinet maker safety', 'woodworking compliance', 'cabinet manufacturing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'custom-furniture-shops',
    name: 'Custom Furniture Shops',
    hazards: ['wood dust', 'lacquer and stain fumes', 'power tool injuries', 'ergonomic strain', 'electrical hazards'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1910.1200', '29 CFR 1910.303', '29 CFR 1910.212'],
    keywords: ['furniture shop safety', 'custom furniture OSHA', 'furniture maker compliance', 'woodworking shop regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'sawmills',
    name: 'Sawmills',
    hazards: ['saw blade injuries', 'log handling', 'noise exposure', 'dust inhalation', 'falling timber'],
    oshaStandards: ['29 CFR 1910.265', '29 CFR 1910.95', '29 CFR 1910.134', '29 CFR 1910.147'],
    keywords: ['sawmill OSHA requirements', 'lumber mill safety', 'sawmill compliance', 'timber processing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'millwork-shops',
    name: 'Millwork & Trim Shops',
    hazards: ['router injuries', 'wood dust', 'repetitive motion', 'material handling', 'finish fumes'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.134', '29 CFR 1910.1200', '29 CFR 1910.176'],
    keywords: ['millwork shop safety', 'trim shop OSHA', 'architectural millwork compliance', 'custom millwork regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'pallet-manufacturers',
    name: 'Pallet Manufacturing Facilities',
    hazards: ['nail gun injuries', 'forklift hazards', 'repetitive strain', 'wood splinters', 'stacking hazards'],
    oshaStandards: ['29 CFR 1910.178', '29 CFR 1910.176', '29 CFR 1910.134', '29 CFR 1910.95'],
    keywords: ['pallet manufacturing OSHA', 'pallet shop safety', 'wood pallet compliance', 'pallet factory regulations'],
    parentCategory: 'Manufacturing'
  },

  // STONE & MASONRY
  {
    id: 'headstone-monument-shops',
    name: 'Headstone & Monument Shops',
    hazards: ['respirable crystalline silica', 'heavy lifting', 'sandblasting hazards', 'cutting equipment', 'dust exposure'],
    oshaStandards: ['29 CFR 1926.1153', '29 CFR 1910.134', '29 CFR 1910.212', '29 CFR 1910.176'],
    keywords: ['headstone shop OSHA', 'monument maker safety', 'memorial stone compliance', 'gravestone manufacturing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'countertop-fabrication',
    name: 'Countertop Fabrication Shops',
    hazards: ['silica dust', 'wet cutting hazards', 'heavy slab handling', 'adhesive fumes', 'tool injuries'],
    oshaStandards: ['29 CFR 1926.1153', '29 CFR 1910.134', '29 CFR 1910.1200', '29 CFR 1910.212'],
    keywords: ['countertop fabrication OSHA', 'granite shop safety', 'quartz fabrication compliance', 'stone countertop regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'brick-masonry-contractors',
    name: 'Brick & Masonry Contractors',
    hazards: ['silica exposure', 'scaffold falls', 'material handling', 'mortar chemical exposure', 'heat stress'],
    oshaStandards: ['29 CFR 1926.1153', '29 CFR 1926.451', '29 CFR 1926.1200', '29 CFR 1910.134'],
    keywords: ['masonry contractor OSHA', 'bricklayer safety', 'masonry compliance requirements', 'brick laying regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'stone-cutting-facilities',
    name: 'Stone Cutting Facilities',
    hazards: ['crystalline silica', 'wet saw hazards', 'heavy material handling', 'noise exposure', 'eye injuries'],
    oshaStandards: ['29 CFR 1926.1153', '29 CFR 1910.95', '29 CFR 1910.133', '29 CFR 1910.212'],
    keywords: ['stone cutting OSHA', 'stone fabrication safety', 'natural stone compliance', 'stone processing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'tile-installation',
    name: 'Tile Installation Companies',
    hazards: ['silica dust from cutting', 'knee injuries', 'adhesive fumes', 'sharp tile edges', 'ergonomic hazards'],
    oshaStandards: ['29 CFR 1926.1153', '29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.132'],
    keywords: ['tile installer OSHA', 'flooring contractor safety', 'tile installation compliance', 'ceramic tile regulations'],
    parentCategory: 'Construction'
  },

  // AUTOMOTIVE & VEHICLE
  {
    id: 'auto-body-shops',
    name: 'Auto Body & Collision Repair Shops',
    hazards: ['paint spray fumes', 'isocyanate exposure', 'welding fumes', 'sanding dust', 'chemical exposure'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1910.1200', '29 CFR 1910.107', '29 CFR 1910.252'],
    keywords: ['auto body shop OSHA', 'collision repair safety', 'body shop compliance', 'automotive painting regulations'],
    parentCategory: 'Automotive'
  },
  {
    id: 'tire-shops',
    name: 'Tire Shops & Service Centers',
    hazards: ['tire explosion hazards', 'lifting injuries', 'wheel mounting accidents', 'chemical exposure', 'vehicle movement'],
    oshaStandards: ['29 CFR 1910.177', '29 CFR 1910.1200', '29 CFR 1910.132', '29 CFR 1910.176'],
    keywords: ['tire shop OSHA requirements', 'tire service safety', 'tire dealer compliance', 'wheel service regulations'],
    parentCategory: 'Automotive'
  },
  {
    id: 'brake-repair-shops',
    name: 'Brake Repair Facilities',
    hazards: ['brake dust exposure', 'asbestos legacy materials', 'hydraulic fluid exposure', 'lifting hazards', 'tool injuries'],
    oshaStandards: ['29 CFR 1910.1001', '29 CFR 1910.1200', '29 CFR 1910.132', '29 CFR 1910.134'],
    keywords: ['brake shop OSHA', 'brake repair safety', 'brake service compliance', 'automotive brake regulations'],
    parentCategory: 'Automotive'
  },
  {
    id: 'oil-change-shops',
    name: 'Quick Lube & Oil Change Shops',
    hazards: ['used oil exposure', 'pit hazards', 'vehicle movement', 'chemical burns', 'ergonomic strain'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.132', '29 CFR 1910.22', '29 CFR 1910.146'],
    keywords: ['oil change shop OSHA', 'quick lube safety', 'oil service compliance', 'automotive fluid regulations'],
    parentCategory: 'Automotive'
  },
  {
    id: 'diesel-truck-repair',
    name: 'Diesel & Heavy Truck Repair Shops',
    hazards: ['diesel exhaust fumes', 'heavy lifting', 'hydraulic system hazards', 'tire mounting dangers', 'confined spaces'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1910.177', '29 CFR 1910.146', '29 CFR 1910.176'],
    keywords: ['diesel repair shop OSHA', 'truck mechanic safety', 'heavy equipment compliance', 'commercial vehicle regulations'],
    parentCategory: 'Automotive'
  },
  {
    id: 'motorcycle-repair',
    name: 'Motorcycle Repair Shops',
    hazards: ['fuel handling', 'battery acid', 'lifting hazards', 'chemical exposure', 'electrical hazards'],
    oshaStandards: ['29 CFR 1910.106', '29 CFR 1910.1200', '29 CFR 1910.303', '29 CFR 1910.132'],
    keywords: ['motorcycle shop OSHA', 'motorcycle repair safety', 'powersports compliance', 'motorcycle service regulations'],
    parentCategory: 'Automotive'
  },
  {
    id: 'auto-detailing',
    name: 'Auto Detailing Shops',
    hazards: ['chemical exposure', 'slippery surfaces', 'electrical hazards', 'ergonomic strain', 'ventilation issues'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.22', '29 CFR 1910.303', '29 CFR 1910.134'],
    keywords: ['auto detailing OSHA', 'car detailing safety', 'vehicle detailing compliance', 'detailing business regulations'],
    parentCategory: 'Automotive'
  },

  // METAL FABRICATION & WELDING
  {
    id: 'welding-shops',
    name: 'Welding Shops',
    hazards: ['welding fumes', 'arc flash', 'burns', 'UV radiation', 'fire hazards', 'compressed gas cylinders'],
    oshaStandards: ['29 CFR 1910.252', '29 CFR 1910.134', '29 CFR 1910.253', '29 CFR 1910.133'],
    keywords: ['welding shop OSHA', 'welder safety requirements', 'welding compliance', 'metal fabrication regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'machine-shops',
    name: 'Machine Shops',
    hazards: ['rotating machinery', 'metal chips', 'cutting fluid exposure', 'noise', 'heavy lifting'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.95', '29 CFR 1910.1200', '29 CFR 1910.147'],
    keywords: ['machine shop OSHA', 'machinist safety', 'CNC shop compliance', 'precision machining regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'sheet-metal-shops',
    name: 'Sheet Metal Fabrication Shops',
    hazards: ['sharp edges and cuts', 'press brake injuries', 'noise exposure', 'material handling', 'welding fumes'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.217', '29 CFR 1910.95', '29 CFR 1910.252'],
    keywords: ['sheet metal shop OSHA', 'metal fabrication safety', 'sheet metal compliance', 'HVAC fabrication regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'blacksmith-shops',
    name: 'Blacksmith & Forge Shops',
    hazards: ['extreme heat', 'burns', 'hammer strike injuries', 'fire hazards', 'metal fumes', 'noise'],
    oshaStandards: ['29 CFR 1910.252', '29 CFR 1910.95', '29 CFR 1910.132', '29 CFR 1910.157'],
    keywords: ['blacksmith shop OSHA', 'forge safety', 'metalworking compliance', 'blacksmithing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'ornamental-iron',
    name: 'Ornamental Iron & Railing Shops',
    hazards: ['welding hazards', 'grinding injuries', 'heavy material handling', 'paint fumes', 'sharp edges'],
    oshaStandards: ['29 CFR 1910.252', '29 CFR 1910.212', '29 CFR 1910.1200', '29 CFR 1910.176'],
    keywords: ['ornamental iron OSHA', 'railing fabrication safety', 'wrought iron compliance', 'metal railing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'powder-coating',
    name: 'Powder Coating Facilities',
    hazards: ['combustible dust', 'chemical exposure', 'oven hazards', 'electrical hazards', 'respiratory risks'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.107', '29 CFR 1910.134', '29 CFR 1910.303'],
    keywords: ['powder coating OSHA', 'powder coating safety', 'metal finishing compliance', 'coating facility regulations'],
    parentCategory: 'Manufacturing'
  },

  // FOOD & BEVERAGE
  {
    id: 'commercial-bakeries',
    name: 'Commercial Bakeries',
    hazards: ['flour dust explosion', 'hot oven burns', 'mixer entanglement', 'slippery floors', 'repetitive motion'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1910.212', '29 CFR 1910.22', '29 CFR 1910.132'],
    keywords: ['bakery OSHA requirements', 'commercial bakery safety', 'bakery compliance', 'bread production regulations'],
    parentCategory: 'Food Service'
  },
  {
    id: 'meat-processing',
    name: 'Meat Processing Plants',
    hazards: ['knife injuries', 'slippery floors', 'cold stress', 'ammonia exposure', 'repetitive motion disorders'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1910.132', '29 CFR 1910.22', '29 CFR 1910.1200'],
    keywords: ['meat processing OSHA', 'slaughterhouse safety', 'meat packing compliance', 'butcher shop regulations'],
    parentCategory: 'Food Service'
  },
  {
    id: 'commercial-kitchens',
    name: 'Commercial Kitchens & Restaurants',
    hazards: ['burns', 'knife injuries', 'slippery floors', 'fire hazards', 'chemical cleaners', 'lifting injuries'],
    oshaStandards: ['29 CFR 1910.22', '29 CFR 1910.157', '29 CFR 1910.1200', '29 CFR 1910.132'],
    keywords: ['restaurant OSHA', 'commercial kitchen safety', 'food service compliance', 'restaurant regulations'],
    parentCategory: 'Food Service'
  },
  {
    id: 'breweries',
    name: 'Craft Breweries',
    hazards: ['confined space hazards', 'CO2 exposure', 'hot liquid burns', 'slippery floors', 'chemical cleaning agents'],
    oshaStandards: ['29 CFR 1910.146', '29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.22'],
    keywords: ['brewery OSHA requirements', 'craft brewery safety', 'beer production compliance', 'brewery regulations'],
    parentCategory: 'Food Service'
  },
  {
    id: 'coffee-roasters',
    name: 'Coffee Roasting Facilities',
    hazards: ['fire hazards', 'dust explosion', 'burn injuries', 'CO exposure', 'chaff combustion'],
    oshaStandards: ['29 CFR 1910.157', '29 CFR 1910.134', '29 CFR 1910.132', '29 CFR 1910.1200'],
    keywords: ['coffee roaster OSHA', 'coffee roasting safety', 'roastery compliance', 'coffee production regulations'],
    parentCategory: 'Food Service'
  },
  {
    id: 'food-trucks',
    name: 'Food Trucks & Mobile Vendors',
    hazards: ['propane hazards', 'fire risks', 'electrical hazards', 'slips and falls', 'confined space', 'burns'],
    oshaStandards: ['29 CFR 1910.110', '29 CFR 1910.157', '29 CFR 1910.303', '29 CFR 1910.22'],
    keywords: ['food truck OSHA', 'mobile food vendor safety', 'food truck compliance', 'mobile kitchen regulations'],
    parentCategory: 'Food Service'
  },
  {
    id: 'ice-cream-manufacturing',
    name: 'Ice Cream & Frozen Dessert Manufacturing',
    hazards: ['ammonia refrigeration', 'cold stress', 'slippery floors', 'mixer entanglement', 'confined spaces'],
    oshaStandards: ['29 CFR 1910.111', '29 CFR 1910.146', '29 CFR 1910.212', '29 CFR 1910.22'],
    keywords: ['ice cream plant OSHA', 'frozen dessert safety', 'dairy manufacturing compliance', 'ice cream production regulations'],
    parentCategory: 'Food Service'
  },

  // PERSONAL SERVICES & BEAUTY
  {
    id: 'nail-salons',
    name: 'Nail Salons',
    hazards: ['chemical exposure', 'ventilation issues', 'repetitive motion', 'UV light exposure', 'skin sensitizers'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.1000', '29 CFR 1910.132'],
    keywords: ['nail salon OSHA', 'manicurist safety', 'nail salon compliance', 'beauty salon regulations'],
    parentCategory: 'Personal Services'
  },
  {
    id: 'hair-salons',
    name: 'Hair Salons & Barbershops',
    hazards: ['chemical exposure', 'ergonomic strain', 'slippery floors', 'electrical hazards', 'sharp tool injuries'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.303', '29 CFR 1910.22', '29 CFR 1910.132'],
    keywords: ['hair salon OSHA', 'barbershop safety', 'salon compliance', 'cosmetology regulations'],
    parentCategory: 'Personal Services'
  },
  {
    id: 'tattoo-parlors',
    name: 'Tattoo Parlors & Body Piercing Studios',
    hazards: ['bloodborne pathogens', 'sharps injuries', 'chemical exposure', 'ergonomic strain', 'skin sensitizers'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.132'],
    keywords: ['tattoo shop OSHA', 'tattoo parlor safety', 'body art compliance', 'piercing studio regulations'],
    parentCategory: 'Personal Services'
  },
  {
    id: 'massage-therapy',
    name: 'Massage Therapy & Spa Facilities',
    hazards: ['ergonomic injuries', 'chemical exposure', 'slippery surfaces', 'bloodborne pathogen risk', 'essential oil sensitivities'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.1200', '29 CFR 1910.22', '29 CFR 1910.132'],
    keywords: ['massage therapy OSHA', 'spa safety requirements', 'massage compliance', 'wellness center regulations'],
    parentCategory: 'Personal Services'
  },
  {
    id: 'tanning-salons',
    name: 'Tanning Salons',
    hazards: ['UV radiation exposure', 'electrical hazards', 'slip hazards', 'chemical cleaning agents', 'fire risks'],
    oshaStandards: ['29 CFR 1910.303', '29 CFR 1910.22', '29 CFR 1910.1200', '29 CFR 1910.157'],
    keywords: ['tanning salon OSHA', 'tanning bed safety', 'tanning compliance', 'UV exposure regulations'],
    parentCategory: 'Personal Services'
  },

  // PRINTING & GRAPHICS
  {
    id: 'screen-printing',
    name: 'Screen Printing Shops',
    hazards: ['chemical solvents', 'ink exposure', 'press hazards', 'repetitive motion', 'ventilation issues'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.212', '29 CFR 1910.132'],
    keywords: ['screen printing OSHA', 'print shop safety', 't-shirt printing compliance', 'apparel printing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'commercial-printing',
    name: 'Commercial Printing Facilities',
    hazards: ['press entanglement', 'solvent exposure', 'noise', 'paper cuts', 'lifting injuries'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.1200', '29 CFR 1910.95', '29 CFR 1910.176'],
    keywords: ['printing company OSHA', 'commercial printing safety', 'print shop compliance', 'printing industry regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'sign-making',
    name: 'Sign Making & Fabrication Shops',
    hazards: ['electrical hazards', 'cutting tool injuries', 'chemical fumes', 'lifting heavy signs', 'ladder falls'],
    oshaStandards: ['29 CFR 1910.303', '29 CFR 1910.212', '29 CFR 1910.1200', '29 CFR 1910.23'],
    keywords: ['sign shop OSHA', 'sign making safety', 'sign fabrication compliance', 'signage manufacturing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'embroidery-shops',
    name: 'Embroidery & Monogramming Shops',
    hazards: ['needle injuries', 'machine entanglement', 'repetitive strain', 'ergonomic hazards', 'electrical risks'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.303', '29 CFR 1910.132', '29 CFR 1910.22'],
    keywords: ['embroidery shop OSHA', 'custom embroidery safety', 'embroidery compliance', 'textile decoration regulations'],
    parentCategory: 'Manufacturing'
  },

  // CONSTRUCTION TRADES
  {
    id: 'hvac-contractors',
    name: 'HVAC Contractors',
    hazards: ['refrigerant exposure', 'electrical hazards', 'confined spaces', 'heat stress', 'falls from heights'],
    oshaStandards: ['29 CFR 1926.451', '29 CFR 1910.146', '29 CFR 1910.303', '29 CFR 1910.134'],
    keywords: ['HVAC contractor OSHA', 'HVAC safety requirements', 'heating cooling compliance', 'HVAC regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'plumbing-contractors',
    name: 'Plumbing Contractors',
    hazards: ['trenching hazards', 'confined spaces', 'lead exposure', 'burns', 'heavy lifting'],
    oshaStandards: ['29 CFR 1926.650', '29 CFR 1910.146', '29 CFR 1926.62', '29 CFR 1910.176'],
    keywords: ['plumber OSHA requirements', 'plumbing contractor safety', 'plumbing compliance', 'pipe fitting regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'electrical-contractors',
    name: 'Electrical Contractors',
    hazards: ['electrocution', 'arc flash', 'falls', 'burns', 'confined spaces'],
    oshaStandards: ['29 CFR 1910.333', '29 CFR 1910.335', '29 CFR 1926.405', '29 CFR 1910.269'],
    keywords: ['electrical contractor OSHA', 'electrician safety', 'electrical compliance', 'electrical work regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'roofing-contractors',
    name: 'Roofing Contractors',
    hazards: ['falls from heights', 'heat stress', 'tar burns', 'material handling', 'electrical contact'],
    oshaStandards: ['29 CFR 1926.501', '29 CFR 1926.502', '29 CFR 1926.503', '29 CFR 1926.451'],
    keywords: ['roofing contractor OSHA', 'roofing safety requirements', 'roofing compliance', 'roof work regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'painting-contractors',
    name: 'Painting Contractors',
    hazards: ['lead paint exposure', 'fall hazards', 'solvent fumes', 'respiratory risks', 'scaffold safety'],
    oshaStandards: ['29 CFR 1926.62', '29 CFR 1926.501', '29 CFR 1910.1200', '29 CFR 1910.134'],
    keywords: ['painting contractor OSHA', 'painter safety', 'painting compliance', 'coating contractor regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'flooring-contractors',
    name: 'Flooring Installation Contractors',
    hazards: ['adhesive fumes', 'knee injuries', 'silica from cutting', 'ergonomic strain', 'chemical exposure'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1926.1153', '29 CFR 1910.134', '29 CFR 1910.132'],
    keywords: ['flooring contractor OSHA', 'flooring installer safety', 'floor installation compliance', 'flooring regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'drywall-contractors',
    name: 'Drywall & Plastering Contractors',
    hazards: ['silica dust', 'scaffold falls', 'joint compound exposure', 'repetitive motion', 'material handling'],
    oshaStandards: ['29 CFR 1926.1153', '29 CFR 1926.451', '29 CFR 1910.134', '29 CFR 1910.176'],
    keywords: ['drywall contractor OSHA', 'drywall safety', 'plastering compliance', 'gypsum board regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'framing-contractors',
    name: 'Framing Contractors',
    hazards: ['fall hazards', 'nail gun injuries', 'struck-by hazards', 'power tool injuries', 'material handling'],
    oshaStandards: ['29 CFR 1926.501', '29 CFR 1926.502', '29 CFR 1910.212', '29 CFR 1926.451'],
    keywords: ['framing contractor OSHA', 'wood framing safety', 'framing compliance', 'construction framing regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'concrete-contractors',
    name: 'Concrete Contractors',
    hazards: ['silica exposure', 'chemical burns', 'struck-by hazards', 'trenching hazards', 'ergonomic strain'],
    oshaStandards: ['29 CFR 1926.1153', '29 CFR 1926.650', '29 CFR 1910.1200', '29 CFR 1910.134'],
    keywords: ['concrete contractor OSHA', 'concrete safety', 'flatwork compliance', 'concrete work regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'demolition-contractors',
    name: 'Demolition Contractors',
    hazards: ['structural collapse', 'asbestos exposure', 'lead exposure', 'falling objects', 'heavy equipment'],
    oshaStandards: ['29 CFR 1926.850', '29 CFR 1926.1101', '29 CFR 1926.62', '29 CFR 1926.651'],
    keywords: ['demolition contractor OSHA', 'demolition safety', 'wrecking compliance', 'building demolition regulations'],
    parentCategory: 'Construction'
  },

  // LANDSCAPING & OUTDOOR
  {
    id: 'landscaping-companies',
    name: 'Landscaping Companies',
    hazards: ['equipment hazards', 'heat stress', 'noise exposure', 'chemical pesticides', 'ergonomic injuries'],
    oshaStandards: ['29 CFR 1910.95', '29 CFR 1910.1200', '29 CFR 1910.212', '29 CFR 1910.132'],
    keywords: ['landscaping OSHA', 'lawn care safety', 'landscaping compliance', 'grounds maintenance regulations'],
    parentCategory: 'Agriculture'
  },
  {
    id: 'tree-trimming',
    name: 'Tree Trimming & Removal Services',
    hazards: ['falls from height', 'chainsaw injuries', 'struck-by hazards', 'electrical contact', 'chipper hazards'],
    oshaStandards: ['29 CFR 1910.269', '29 CFR 1910.23', '29 CFR 1910.212', '29 CFR 1910.132'],
    keywords: ['tree service OSHA', 'arborist safety', 'tree trimming compliance', 'tree removal regulations'],
    parentCategory: 'Agriculture'
  },
  {
    id: 'irrigation-contractors',
    name: 'Irrigation System Contractors',
    hazards: ['trenching hazards', 'electrical hazards', 'heat stress', 'material handling', 'confined spaces'],
    oshaStandards: ['29 CFR 1926.650', '29 CFR 1910.303', '29 CFR 1910.146', '29 CFR 1910.176'],
    keywords: ['irrigation contractor OSHA', 'sprinkler installation safety', 'irrigation compliance', 'landscape irrigation regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'fence-contractors',
    name: 'Fence Installation Contractors',
    hazards: ['post hole auger hazards', 'lifting injuries', 'power tool injuries', 'heat stress', 'struck-by hazards'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.176', '29 CFR 1910.132', '29 CFR 1926.651'],
    keywords: ['fence contractor OSHA', 'fence installation safety', 'fencing compliance', 'fence building regulations'],
    parentCategory: 'Construction'
  },
  {
    id: 'pool-contractors',
    name: 'Pool Construction & Service Companies',
    hazards: ['excavation hazards', 'chemical exposure', 'electrical hazards', 'confined spaces', 'drowning risks'],
    oshaStandards: ['29 CFR 1926.650', '29 CFR 1910.1200', '29 CFR 1910.303', '29 CFR 1910.146'],
    keywords: ['pool contractor OSHA', 'pool construction safety', 'swimming pool compliance', 'pool service regulations'],
    parentCategory: 'Construction'
  },

  // CLEANING & MAINTENANCE
  {
    id: 'dry-cleaners',
    name: 'Dry Cleaning Facilities',
    hazards: ['solvent exposure', 'fire hazards', 'heat stress', 'ergonomic strain', 'chemical burns'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.157', '29 CFR 1910.106'],
    keywords: ['dry cleaner OSHA', 'dry cleaning safety', 'laundry compliance', 'perc exposure regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'commercial-laundry',
    name: 'Commercial Laundry Facilities',
    hazards: ['machine entanglement', 'heat burns', 'chemical exposure', 'ergonomic strain', 'slip hazards'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.1200', '29 CFR 1910.22', '29 CFR 1910.132'],
    keywords: ['commercial laundry OSHA', 'industrial laundry safety', 'laundry facility compliance', 'linen service regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'janitorial-services',
    name: 'Janitorial & Cleaning Services',
    hazards: ['chemical exposure', 'slip and fall hazards', 'bloodborne pathogens', 'ergonomic strain', 'electrical hazards'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.1030', '29 CFR 1910.22', '29 CFR 1910.303'],
    keywords: ['janitorial OSHA', 'cleaning service safety', 'janitorial compliance', 'commercial cleaning regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'carpet-cleaning',
    name: 'Carpet & Upholstery Cleaning Services',
    hazards: ['chemical exposure', 'electrical hazards', 'ergonomic strain', 'slip hazards', 'equipment injuries'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.303', '29 CFR 1910.132', '29 CFR 1910.22'],
    keywords: ['carpet cleaning OSHA', 'upholstery cleaning safety', 'carpet cleaner compliance', 'floor care regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'window-cleaning',
    name: 'Window Cleaning Services',
    hazards: ['falls from height', 'scaffold hazards', 'chemical exposure', 'struck-by hazards', 'electrical contact'],
    oshaStandards: ['29 CFR 1910.23', '29 CFR 1926.451', '29 CFR 1910.1200', '29 CFR 1910.132'],
    keywords: ['window cleaning OSHA', 'window washer safety', 'high-rise cleaning compliance', 'window cleaning regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'pressure-washing',
    name: 'Pressure Washing & Power Washing Services',
    hazards: ['high pressure injuries', 'electrical hazards', 'chemical exposure', 'slip hazards', 'ladder falls'],
    oshaStandards: ['29 CFR 1910.303', '29 CFR 1910.1200', '29 CFR 1910.23', '29 CFR 1910.132'],
    keywords: ['pressure washing OSHA', 'power washing safety', 'exterior cleaning compliance', 'pressure washer regulations'],
    parentCategory: 'Service'
  },

  // HEALTHCARE & MEDICAL
  {
    id: 'dental-offices',
    name: 'Dental Offices',
    hazards: ['bloodborne pathogens', 'radiation exposure', 'chemical exposure', 'ergonomic strain', 'sharps injuries'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.1096', '29 CFR 1910.1200', '29 CFR 1910.134'],
    keywords: ['dental office OSHA', 'dental practice safety', 'dental compliance', 'dentist regulations'],
    parentCategory: 'Healthcare'
  },
  {
    id: 'veterinary-clinics',
    name: 'Veterinary Clinics',
    hazards: ['animal bites', 'zoonotic diseases', 'chemical exposure', 'radiation exposure', 'ergonomic strain'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.1200', '29 CFR 1910.1096', '29 CFR 1910.132'],
    keywords: ['veterinary OSHA', 'vet clinic safety', 'veterinary compliance', 'animal hospital regulations'],
    parentCategory: 'Healthcare'
  },
  {
    id: 'chiropractic-offices',
    name: 'Chiropractic Offices',
    hazards: ['ergonomic injuries', 'bloodborne pathogen risk', 'electrical equipment hazards', 'patient handling', 'slip hazards'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.303', '29 CFR 1910.22', '29 CFR 1910.132'],
    keywords: ['chiropractic OSHA', 'chiropractor safety', 'chiropractic compliance', 'chiropractic office regulations'],
    parentCategory: 'Healthcare'
  },
  {
    id: 'physical-therapy',
    name: 'Physical Therapy Clinics',
    hazards: ['patient handling injuries', 'equipment hazards', 'bloodborne pathogens', 'slip hazards', 'electrical risks'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.303', '29 CFR 1910.22', '29 CFR 1910.176'],
    keywords: ['physical therapy OSHA', 'PT clinic safety', 'physical therapy compliance', 'rehab clinic regulations'],
    parentCategory: 'Healthcare'
  },
  {
    id: 'optical-shops',
    name: 'Optical Shops & Labs',
    hazards: ['chemical exposure', 'grinding hazards', 'UV exposure', 'ergonomic strain', 'sharp tool injuries'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.212', '29 CFR 1910.133', '29 CFR 1910.132'],
    keywords: ['optical shop OSHA', 'optician safety', 'optical lab compliance', 'eyewear manufacturing regulations'],
    parentCategory: 'Healthcare'
  },
  {
    id: 'home-health-care',
    name: 'Home Health Care Agencies',
    hazards: ['patient handling', 'bloodborne pathogens', 'needle sticks', 'driving hazards', 'violence'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.1200', '29 CFR 1910.132', '29 CFR 1904'],
    keywords: ['home health OSHA', 'home care safety', 'home health compliance', 'visiting nurse regulations'],
    parentCategory: 'Healthcare'
  },

  // WAREHOUSE & LOGISTICS
  {
    id: 'warehouse-operations',
    name: 'Warehouse & Distribution Centers',
    hazards: ['forklift hazards', 'falling objects', 'material handling', 'ergonomic injuries', 'loading dock hazards'],
    oshaStandards: ['29 CFR 1910.178', '29 CFR 1910.176', '29 CFR 1910.23', '29 CFR 1910.30'],
    keywords: ['warehouse OSHA', 'distribution center safety', 'warehouse compliance', 'logistics regulations'],
    parentCategory: 'Logistics'
  },
  {
    id: 'moving-companies',
    name: 'Moving & Relocation Companies',
    hazards: ['heavy lifting', 'truck hazards', 'falls', 'struck-by injuries', 'ergonomic strain'],
    oshaStandards: ['29 CFR 1910.176', '29 CFR 1910.178', '29 CFR 1910.23', '29 CFR 1910.132'],
    keywords: ['moving company OSHA', 'mover safety', 'relocation compliance', 'moving industry regulations'],
    parentCategory: 'Logistics'
  },
  {
    id: 'delivery-services',
    name: 'Delivery & Courier Services',
    hazards: ['vehicle accidents', 'lifting injuries', 'dog bites', 'slip and fall', 'ergonomic strain'],
    oshaStandards: ['29 CFR 1910.176', '29 CFR 1910.132', '29 CFR 1910.22', '29 CFR 1904'],
    keywords: ['delivery service OSHA', 'courier safety', 'delivery compliance', 'package delivery regulations'],
    parentCategory: 'Logistics'
  },
  {
    id: 'cold-storage',
    name: 'Cold Storage & Refrigerated Warehouses',
    hazards: ['cold stress', 'ammonia exposure', 'forklift hazards', 'slippery surfaces', 'confined spaces'],
    oshaStandards: ['29 CFR 1910.111', '29 CFR 1910.146', '29 CFR 1910.178', '29 CFR 1910.22'],
    keywords: ['cold storage OSHA', 'refrigerated warehouse safety', 'freezer warehouse compliance', 'cold chain regulations'],
    parentCategory: 'Logistics'
  },

  // RETAIL & SPECIALTY
  {
    id: 'liquor-stores',
    name: 'Liquor Stores',
    hazards: ['robbery violence', 'heavy lifting', 'slip hazards', 'glass breakage', 'ladder falls'],
    oshaStandards: ['29 CFR 1910.176', '29 CFR 1910.22', '29 CFR 1910.23', '29 CFR 1910.132'],
    keywords: ['liquor store OSHA', 'package store safety', 'liquor retail compliance', 'alcohol retail regulations'],
    parentCategory: 'Retail'
  },
  {
    id: 'hardware-stores',
    name: 'Hardware Stores',
    hazards: ['heavy lifting', 'forklift hazards', 'falling merchandise', 'ladder hazards', 'chemical storage'],
    oshaStandards: ['29 CFR 1910.178', '29 CFR 1910.176', '29 CFR 1910.106', '29 CFR 1910.1200'],
    keywords: ['hardware store OSHA', 'home improvement safety', 'retail hardware compliance', 'building supply regulations'],
    parentCategory: 'Retail'
  },
  {
    id: 'gun-shops',
    name: 'Gun Shops & Ranges',
    hazards: ['lead exposure', 'noise exposure', 'ventilation hazards', 'accidental discharge', 'chemical exposure'],
    oshaStandards: ['29 CFR 1910.1025', '29 CFR 1910.95', '29 CFR 1910.134', '29 CFR 1910.1200'],
    keywords: ['gun range OSHA', 'shooting range safety', 'firearm dealer compliance', 'gun shop regulations'],
    parentCategory: 'Retail'
  },
  {
    id: 'thrift-stores',
    name: 'Thrift Stores & Donation Centers',
    hazards: ['heavy lifting', 'sharps exposure', 'biological hazards', 'ergonomic strain', 'storage hazards'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.176', '29 CFR 1910.22', '29 CFR 1910.132'],
    keywords: ['thrift store OSHA', 'donation center safety', 'resale shop compliance', 'secondhand store regulations'],
    parentCategory: 'Retail'
  },
  {
    id: 'florist-shops',
    name: 'Florist Shops',
    hazards: ['cutting tool injuries', 'chemical exposure', 'cold exposure', 'ergonomic strain', 'slip hazards'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.22', '29 CFR 1910.132', '29 CFR 1910.212'],
    keywords: ['florist OSHA', 'flower shop safety', 'florist compliance', 'floral industry regulations'],
    parentCategory: 'Retail'
  },

  // AGRICULTURE & FARMING
  {
    id: 'nurseries-greenhouses',
    name: 'Nurseries & Greenhouses',
    hazards: ['pesticide exposure', 'heat stress', 'ergonomic strain', 'forklift hazards', 'slippery floors'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1928.21', '29 CFR 1910.178', '29 CFR 1910.134'],
    keywords: ['nursery OSHA', 'greenhouse safety', 'plant nursery compliance', 'horticulture regulations'],
    parentCategory: 'Agriculture'
  },
  {
    id: 'dairy-farms',
    name: 'Dairy Farms',
    hazards: ['animal handling', 'manure pit hazards', 'machinery hazards', 'zoonotic diseases', 'confined spaces'],
    oshaStandards: ['29 CFR 1928.57', '29 CFR 1910.146', '29 CFR 1910.212', '29 CFR 1910.134'],
    keywords: ['dairy farm OSHA', 'dairy safety', 'milk farm compliance', 'dairy operation regulations'],
    parentCategory: 'Agriculture'
  },
  {
    id: 'horse-stables',
    name: 'Horse Stables & Equestrian Facilities',
    hazards: ['animal handling', 'falls', 'machinery hazards', 'fire hazards', 'zoonotic diseases'],
    oshaStandards: ['29 CFR 1910.157', '29 CFR 1910.22', '29 CFR 1910.132', '29 CFR 1910.212'],
    keywords: ['horse stable OSHA', 'equestrian facility safety', 'barn compliance', 'horse farm regulations'],
    parentCategory: 'Agriculture'
  },
  {
    id: 'poultry-farms',
    name: 'Poultry Farms',
    hazards: ['respiratory hazards', 'ammonia exposure', 'machine hazards', 'ergonomic strain', 'zoonotic diseases'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1910.1200', '29 CFR 1910.212', '29 CFR 1928.57'],
    keywords: ['poultry farm OSHA', 'chicken farm safety', 'poultry operation compliance', 'egg farm regulations'],
    parentCategory: 'Agriculture'
  },
  {
    id: 'vineyards-wineries',
    name: 'Vineyards & Wineries',
    hazards: ['pesticide exposure', 'machinery hazards', 'confined space hazards', 'sulfur dioxide exposure', 'ergonomic strain'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.146', '29 CFR 1910.212', '29 CFR 1910.134'],
    keywords: ['winery OSHA', 'vineyard safety', 'wine production compliance', 'winery regulations'],
    parentCategory: 'Agriculture'
  },
  {
    id: 'fish-hatcheries',
    name: 'Fish Hatcheries & Aquaculture',
    hazards: ['drowning hazards', 'chemical exposure', 'slippery surfaces', 'electrical hazards', 'confined spaces'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.303', '29 CFR 1910.22', '29 CFR 1910.146'],
    keywords: ['fish hatchery OSHA', 'aquaculture safety', 'fish farm compliance', 'aquaculture regulations'],
    parentCategory: 'Agriculture'
  },

  // MANUFACTURING SPECIALTY
  {
    id: 'plastics-manufacturing',
    name: 'Plastics Manufacturing & Injection Molding',
    hazards: ['hot material burns', 'machine entanglement', 'chemical fumes', 'noise exposure', 'fire hazards'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.147', '29 CFR 1910.1200', '29 CFR 1910.95'],
    keywords: ['plastics manufacturing OSHA', 'injection molding safety', 'plastics factory compliance', 'polymer processing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'electronics-assembly',
    name: 'Electronics Assembly Facilities',
    hazards: ['soldering fumes', 'lead exposure', 'ergonomic strain', 'electrostatic discharge', 'chemical exposure'],
    oshaStandards: ['29 CFR 1910.1025', '29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.303'],
    keywords: ['electronics assembly OSHA', 'PCB assembly safety', 'electronics manufacturing compliance', 'circuit board regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'textile-manufacturing',
    name: 'Textile & Fabric Manufacturing',
    hazards: ['cotton dust', 'machine entanglement', 'noise exposure', 'fire hazards', 'ergonomic strain'],
    oshaStandards: ['29 CFR 1910.1043', '29 CFR 1910.212', '29 CFR 1910.95', '29 CFR 1910.157'],
    keywords: ['textile manufacturing OSHA', 'fabric mill safety', 'textile factory compliance', 'garment manufacturing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'candle-making',
    name: 'Candle Making & Wax Manufacturing',
    hazards: ['hot wax burns', 'fire hazards', 'fragrance chemical exposure', 'respiratory hazards', 'slip hazards'],
    oshaStandards: ['29 CFR 1910.106', '29 CFR 1910.157', '29 CFR 1910.1200', '29 CFR 1910.134'],
    keywords: ['candle making OSHA', 'candle factory safety', 'wax manufacturing compliance', 'candle production regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'soap-cosmetics',
    name: 'Soap & Cosmetics Manufacturing',
    hazards: ['chemical exposure', 'skin sensitizers', 'lye burns', 'respiratory hazards', 'slip hazards'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.132', '29 CFR 1910.22'],
    keywords: ['soap making OSHA', 'cosmetics manufacturing safety', 'soap factory compliance', 'personal care manufacturing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'pottery-ceramics',
    name: 'Pottery & Ceramics Studios',
    hazards: ['silica dust', 'kiln burns', 'glazing chemicals', 'ergonomic strain', 'slip hazards'],
    oshaStandards: ['29 CFR 1926.1153', '29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.132'],
    keywords: ['pottery studio OSHA', 'ceramics safety', 'pottery shop compliance', 'ceramic manufacturing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'glass-blowing',
    name: 'Glass Blowing & Art Glass Studios',
    hazards: ['extreme heat', 'burns', 'respiratory hazards', 'eye injuries', 'cuts from broken glass'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1910.133', '29 CFR 1910.132', '29 CFR 1910.157'],
    keywords: ['glass blowing OSHA', 'glass studio safety', 'art glass compliance', 'glass manufacturing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'leather-goods',
    name: 'Leather Goods Manufacturing',
    hazards: ['chemical exposure', 'cutting tool injuries', 'ergonomic strain', 'respiratory hazards', 'machine entanglement'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.212', '29 CFR 1910.134', '29 CFR 1910.132'],
    keywords: ['leather manufacturing OSHA', 'leather goods safety', 'tannery compliance', 'leather shop regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'musical-instrument',
    name: 'Musical Instrument Manufacturing',
    hazards: ['wood dust', 'lacquer fumes', 'noise exposure', 'machine hazards', 'ergonomic strain'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1910.1200', '29 CFR 1910.95', '29 CFR 1910.212'],
    keywords: ['instrument making OSHA', 'guitar factory safety', 'luthier compliance', 'instrument manufacturing regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'boat-manufacturing',
    name: 'Boat & Marine Manufacturing',
    hazards: ['fiberglass exposure', 'styrene fumes', 'confined spaces', 'heavy lifting', 'electrical hazards'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.146', '29 CFR 1910.176'],
    keywords: ['boat manufacturing OSHA', 'marine manufacturing safety', 'boat building compliance', 'fiberglass boat regulations'],
    parentCategory: 'Manufacturing'
  },

  // ENTERTAINMENT & RECREATION
  {
    id: 'bowling-alleys',
    name: 'Bowling Alleys',
    hazards: ['machinery hazards', 'electrical hazards', 'slip hazards', 'ergonomic strain', 'chemical cleaning'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.303', '29 CFR 1910.22', '29 CFR 1910.147'],
    keywords: ['bowling alley OSHA', 'bowling center safety', 'bowling facility compliance', 'entertainment venue regulations'],
    parentCategory: 'Entertainment'
  },
  {
    id: 'trampoline-parks',
    name: 'Trampoline Parks',
    hazards: ['fall hazards', 'collision injuries', 'emergency response', 'electrical hazards', 'slip hazards'],
    oshaStandards: ['29 CFR 1910.22', '29 CFR 1910.303', '29 CFR 1910.38', '29 CFR 1910.151'],
    keywords: ['trampoline park OSHA', 'jump park safety', 'trampoline facility compliance', 'indoor recreation regulations'],
    parentCategory: 'Entertainment'
  },
  {
    id: 'escape-rooms',
    name: 'Escape Room Facilities',
    hazards: ['fire egress hazards', 'electrical hazards', 'emergency procedures', 'trip hazards', 'prop injuries'],
    oshaStandards: ['29 CFR 1910.38', '29 CFR 1910.303', '29 CFR 1910.22', '29 CFR 1910.37'],
    keywords: ['escape room OSHA', 'escape room safety', 'escape room compliance', 'entertainment venue regulations'],
    parentCategory: 'Entertainment'
  },
  {
    id: 'go-kart-tracks',
    name: 'Go-Kart Tracks & Indoor Racing',
    hazards: ['vehicle collision', 'fuel hazards', 'exhaust fumes', 'noise exposure', 'fire hazards'],
    oshaStandards: ['29 CFR 1910.106', '29 CFR 1910.134', '29 CFR 1910.95', '29 CFR 1910.157'],
    keywords: ['go-kart track OSHA', 'indoor karting safety', 'racing facility compliance', 'motorsport venue regulations'],
    parentCategory: 'Entertainment'
  },
  {
    id: 'paintball-facilities',
    name: 'Paintball & Airsoft Facilities',
    hazards: ['eye injuries', 'trip hazards', 'physical contact injuries', 'compressed air hazards', 'heat stress'],
    oshaStandards: ['29 CFR 1910.133', '29 CFR 1910.22', '29 CFR 1910.132', '29 CFR 1910.101'],
    keywords: ['paintball field OSHA', 'paintball facility safety', 'airsoft field compliance', 'tactical sports regulations'],
    parentCategory: 'Entertainment'
  },
  {
    id: 'gyms-fitness',
    name: 'Gyms & Fitness Centers',
    hazards: ['equipment injuries', 'slip hazards', 'bloodborne pathogens', 'pool hazards', 'electrical hazards'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.22', '29 CFR 1910.303', '29 CFR 1910.38'],
    keywords: ['gym OSHA requirements', 'fitness center safety', 'health club compliance', 'gym regulations'],
    parentCategory: 'Entertainment'
  },
  {
    id: 'martial-arts',
    name: 'Martial Arts Studios',
    hazards: ['physical contact injuries', 'mat hazards', 'bloodborne pathogens', 'equipment injuries', 'heat stress'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.22', '29 CFR 1910.151', '29 CFR 1910.132'],
    keywords: ['martial arts studio OSHA', 'dojo safety', 'martial arts compliance', 'karate studio regulations'],
    parentCategory: 'Entertainment'
  },

  // SPECIALTY SERVICES
  {
    id: 'pest-control',
    name: 'Pest Control Companies',
    hazards: ['pesticide exposure', 'confined space hazards', 'ladder falls', 'animal encounters', 'heat stress'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.146', '29 CFR 1910.23'],
    keywords: ['pest control OSHA', 'exterminator safety', 'pest control compliance', 'pest management regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'locksmith-services',
    name: 'Locksmith Services',
    hazards: ['driving hazards', 'tool injuries', 'electrical hazards', 'violence risks', 'ergonomic strain'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.303', '29 CFR 1910.132', '29 CFR 1904'],
    keywords: ['locksmith OSHA', 'locksmith safety', 'locksmith compliance', 'security service regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'self-storage',
    name: 'Self-Storage Facilities',
    hazards: ['forklift hazards', 'falling objects', 'confined spaces', 'ergonomic strain', 'slip hazards'],
    oshaStandards: ['29 CFR 1910.178', '29 CFR 1910.176', '29 CFR 1910.22', '29 CFR 1910.146'],
    keywords: ['self storage OSHA', 'storage facility safety', 'mini storage compliance', 'storage unit regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'funeral-homes',
    name: 'Funeral Homes & Mortuaries',
    hazards: ['bloodborne pathogens', 'formaldehyde exposure', 'ergonomic strain', 'chemical exposure', 'emotional stress'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.1048', '29 CFR 1910.1200', '29 CFR 1910.134'],
    keywords: ['funeral home OSHA', 'mortuary safety', 'funeral home compliance', 'death care regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'photography-studios',
    name: 'Photography Studios',
    hazards: ['electrical hazards', 'trip hazards', 'lighting equipment burns', 'ergonomic strain', 'chemical exposure'],
    oshaStandards: ['29 CFR 1910.303', '29 CFR 1910.22', '29 CFR 1910.1200', '29 CFR 1910.132'],
    keywords: ['photography studio OSHA', 'photo studio safety', 'photography compliance', 'studio lighting regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'upholstery-shops',
    name: 'Upholstery & Reupholstery Shops',
    hazards: ['cutting tool injuries', 'chemical adhesive exposure', 'ergonomic strain', 'dust exposure', 'fire hazards'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.212', '29 CFR 1910.134', '29 CFR 1910.157'],
    keywords: ['upholstery shop OSHA', 'furniture reupholstery safety', 'upholstery compliance', 'fabric shop regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'appliance-repair',
    name: 'Appliance Repair Shops',
    hazards: ['electrical hazards', 'refrigerant exposure', 'lifting injuries', 'sharp edges', 'moving parts'],
    oshaStandards: ['29 CFR 1910.303', '29 CFR 1910.1200', '29 CFR 1910.176', '29 CFR 1910.212'],
    keywords: ['appliance repair OSHA', 'appliance technician safety', 'appliance service compliance', 'repair shop regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'computer-repair',
    name: 'Computer Repair & IT Services',
    hazards: ['electrical hazards', 'ergonomic strain', 'lead exposure from soldering', 'lifting injuries', 'eye strain'],
    oshaStandards: ['29 CFR 1910.303', '29 CFR 1910.1025', '29 CFR 1910.176', '29 CFR 1910.132'],
    keywords: ['computer repair OSHA', 'IT service safety', 'tech support compliance', 'computer shop regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'pawn-shops',
    name: 'Pawn Shops',
    hazards: ['robbery violence', 'heavy lifting', 'chemical exposure from jewelry', 'electrical hazards', 'sharp objects'],
    oshaStandards: ['29 CFR 1910.176', '29 CFR 1910.1200', '29 CFR 1910.303', '29 CFR 1910.132'],
    keywords: ['pawn shop OSHA', 'pawn shop safety', 'pawnbroker compliance', 'secondhand dealer regulations'],
    parentCategory: 'Retail'
  },
  {
    id: 'pet-grooming',
    name: 'Pet Grooming Salons',
    hazards: ['animal bites and scratches', 'zoonotic diseases', 'chemical exposure', 'ergonomic strain', 'slip hazards'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.22', '29 CFR 1910.132', '29 CFR 1910.303'],
    keywords: ['pet grooming OSHA', 'dog grooming safety', 'pet salon compliance', 'animal grooming regulations'],
    parentCategory: 'Personal Services'
  },
  {
    id: 'taxidermy',
    name: 'Taxidermy Studios',
    hazards: ['chemical exposure', 'sharps injuries', 'zoonotic diseases', 'ergonomic strain', 'respiratory hazards'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.1030', '29 CFR 1910.132'],
    keywords: ['taxidermy OSHA', 'taxidermy studio safety', 'taxidermy compliance', 'wildlife preservation regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'jewelry-repair',
    name: 'Jewelry Repair & Manufacturing',
    hazards: ['chemical exposure', 'soldering fumes', 'eye strain', 'ergonomic injuries', 'fire hazards'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.134', '29 CFR 1910.133', '29 CFR 1910.157'],
    keywords: ['jewelry shop OSHA', 'jeweler safety', 'jewelry manufacturing compliance', 'goldsmith regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'clock-watch-repair',
    name: 'Clock & Watch Repair Shops',
    hazards: ['chemical exposure', 'eye strain', 'ergonomic strain', 'sharp tool injuries', 'radium exposure legacy'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.133', '29 CFR 1910.132', '29 CFR 1910.1096'],
    keywords: ['watch repair OSHA', 'clock repair safety', 'horologist compliance', 'watch shop regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'shoe-repair',
    name: 'Shoe Repair Shops',
    hazards: ['adhesive fumes', 'machine hazards', 'ergonomic strain', 'dust exposure', 'sharp tool injuries'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.212', '29 CFR 1910.134', '29 CFR 1910.132'],
    keywords: ['shoe repair OSHA', 'cobbler safety', 'shoe repair compliance', 'footwear repair regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'tailor-alterations',
    name: 'Tailor & Alteration Shops',
    hazards: ['needle injuries', 'machine hazards', 'ergonomic strain', 'pressing burns', 'chemical exposure'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.1200', '29 CFR 1910.132', '29 CFR 1910.22'],
    keywords: ['tailor shop OSHA', 'alteration shop safety', 'seamstress compliance', 'clothing alteration regulations'],
    parentCategory: 'Service'
  },

  // ADDITIONAL SPECIALTY INDUSTRIES
  {
    id: 'awning-manufacturing',
    name: 'Awning & Tent Manufacturing',
    hazards: ['cutting injuries', 'sewing machine hazards', 'chemical adhesives', 'heavy lifting', 'ladder falls'],
    oshaStandards: ['29 CFR 1910.212', '29 CFR 1910.1200', '29 CFR 1910.176', '29 CFR 1910.23'],
    keywords: ['awning manufacturing OSHA', 'tent maker safety', 'canvas shop compliance', 'awning fabrication regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'trophy-engraving',
    name: 'Trophy & Engraving Shops',
    hazards: ['laser hazards', 'chemical exposure', 'machine hazards', 'ergonomic strain', 'eye injuries'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.212', '29 CFR 1910.133', '29 CFR 1910.132'],
    keywords: ['trophy shop OSHA', 'engraving safety', 'awards shop compliance', 'laser engraving regulations'],
    parentCategory: 'Manufacturing'
  },
  {
    id: 'picture-framing',
    name: 'Picture Framing Shops',
    hazards: ['glass cutting injuries', 'chemical adhesives', 'dust exposure', 'ergonomic strain', 'tool injuries'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.212', '29 CFR 1910.132', '29 CFR 1910.22'],
    keywords: ['picture framing OSHA', 'frame shop safety', 'custom framing compliance', 'art framing regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'sandblasting',
    name: 'Sandblasting & Abrasive Blasting Services',
    hazards: ['silica exposure', 'respiratory hazards', 'noise exposure', 'struck-by hazards', 'confined spaces'],
    oshaStandards: ['29 CFR 1910.134', '29 CFR 1926.1153', '29 CFR 1910.95', '29 CFR 1910.146'],
    keywords: ['sandblasting OSHA', 'abrasive blasting safety', 'sandblasting compliance', 'media blasting regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'ice-rinks',
    name: 'Ice Rinks & Skating Facilities',
    hazards: ['ammonia refrigeration', 'slip hazards', 'ice resurfacer hazards', 'cold stress', 'electrical hazards'],
    oshaStandards: ['29 CFR 1910.111', '29 CFR 1910.22', '29 CFR 1910.178', '29 CFR 1910.303'],
    keywords: ['ice rink OSHA', 'skating rink safety', 'ice arena compliance', 'ice facility regulations'],
    parentCategory: 'Entertainment'
  },
  {
    id: 'mini-golf',
    name: 'Mini Golf & Amusement Facilities',
    hazards: ['electrical hazards', 'water feature hazards', 'slip and trip hazards', 'landscape equipment', 'heat stress'],
    oshaStandards: ['29 CFR 1910.303', '29 CFR 1910.22', '29 CFR 1910.212', '29 CFR 1910.38'],
    keywords: ['mini golf OSHA', 'putt putt safety', 'amusement facility compliance', 'family entertainment regulations'],
    parentCategory: 'Entertainment'
  },
  {
    id: 'dog-kennels',
    name: 'Dog Kennels & Boarding Facilities',
    hazards: ['animal bites', 'zoonotic diseases', 'slip hazards', 'chemical exposure', 'noise exposure'],
    oshaStandards: ['29 CFR 1910.1200', '29 CFR 1910.22', '29 CFR 1910.95', '29 CFR 1910.132'],
    keywords: ['dog kennel OSHA', 'pet boarding safety', 'kennel compliance', 'animal boarding regulations'],
    parentCategory: 'Service'
  },
  {
    id: 'daycare-centers',
    name: 'Daycare Centers & Childcare Facilities',
    hazards: ['bloodborne pathogens', 'slip and fall hazards', 'lifting injuries', 'chemical cleaning agents', 'emergency procedures'],
    oshaStandards: ['29 CFR 1910.1030', '29 CFR 1910.22', '29 CFR 1910.1200', '29 CFR 1910.38'],
    keywords: ['daycare OSHA', 'childcare safety', 'daycare compliance', 'childcare center regulations'],
    parentCategory: 'Service'
  }
];

/**
 * Get a random niche industry that hasn't been used recently
 * @param usedIndustryIds Set of industry IDs that have been used in the last 6 months
 * @returns A randomly selected available niche industry, or null if all have been used
 */
export function getRandomAvailableIndustry(usedIndustryIds: Set<string>): NicheIndustry | null {
  const available = NICHE_INDUSTRIES.filter(i => !usedIndustryIds.has(i.id));
  
  if (available.length === 0) {
    return null;
  }
  
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Get an industry by ID
 */
export function getIndustryById(id: string): NicheIndustry | undefined {
  return NICHE_INDUSTRIES.find(i => i.id === id);
}

/**
 * Get all industries in a specific parent category
 */
export function getIndustriesByCategory(category: string): NicheIndustry[] {
  return NICHE_INDUSTRIES.filter(i => i.parentCategory === category);
}

/**
 * Get all unique parent categories
 */
export function getParentCategories(): string[] {
  return [...new Set(NICHE_INDUSTRIES.map(i => i.parentCategory))];
}
