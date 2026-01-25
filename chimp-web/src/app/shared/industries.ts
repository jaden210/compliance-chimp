/**
 * Static industries list - single source of truth
 * Import this anywhere you need the industries list
 */

export interface Industry {
  id: string;
  name: string;
  nameEs: string;
  icon: string;
  checked?: boolean;
}

export const INDUSTRIES: Industry[] = [
  { id: 'agriculture', name: 'Agriculture', nameEs: 'Agricultura', icon: 'agriculture' },
  { id: 'construction', name: 'Construction', nameEs: 'Construcción', icon: 'construction' },
  { id: 'general', name: 'General Industry', nameEs: 'Industria General', icon: 'business' },
  { id: 'headstone-monument', name: 'Headstone and Monument Companies', nameEs: 'Empresas de Lápidas y Monumentos', icon: 'account_balance' },
  { id: 'healthcare', name: 'Healthcare', nameEs: 'Cuidado de la Salud', icon: 'local_hospital' },
  { id: 'manufacturing', name: 'Manufacturing', nameEs: 'Manufactura', icon: 'precision_manufacturing' },
  { id: 'maritime', name: 'Maritime', nameEs: 'Marítimo', icon: 'directions_boat' },
  { id: 'oil-gas', name: 'Oil & Gas', nameEs: 'Petróleo y Gas', icon: 'oil_barrel' }
];

/**
 * Get a copy of the industries list (to avoid mutation issues)
 */
export function getIndustries(): Industry[] {
  return INDUSTRIES.map(i => ({ ...i }));
}

/**
 * Find an industry by ID
 */
export function getIndustryById(id: string): Industry | undefined {
  return INDUSTRIES.find(i => i.id === id);
}

/**
 * Get industry name by ID
 */
export function getIndustryName(id: string): string {
  return getIndustryById(id)?.name || id;
}
