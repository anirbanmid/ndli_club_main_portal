/**
 * Master mapping of all 36 Indian States and Union Territories with their
 * corresponding administrative regional zones as seeded in the database
 * (data/samples/states.json and data/samples/zones.json).
 */

export interface StateUT {
  code: string;
  name: string;
  zoneCode: 'NORTH' | 'CENTRAL' | 'WEST' | 'EAST' | 'NORTH_EAST' | 'SOUTH';
  zoneName: string;
  kind: 'state' | 'ut';
}

export const ZONE_NAMES: Record<string, string> = {
  NORTH: 'North Zone',
  CENTRAL: 'Central Zone',
  WEST: 'West Zone',
  EAST: 'East Zone',
  NORTH_EAST: 'North East Zone',
  SOUTH: 'South Zone',
};

export const INDIAN_STATES_AND_UTS: ReadonlyArray<StateUT> = [
  { code: 'ANDAMAN_AND_NICOBAR_ISLANDS', name: 'Andaman and Nicobar Islands', zoneCode: 'SOUTH', zoneName: 'South Zone', kind: 'ut' },
  { code: 'ANDHRA_PRADESH', name: 'Andhra Pradesh', zoneCode: 'SOUTH', zoneName: 'South Zone', kind: 'state' },
  { code: 'ARUNACHAL_PRADESH', name: 'Arunachal Pradesh', zoneCode: 'NORTH_EAST', zoneName: 'North East Zone', kind: 'state' },
  { code: 'ASSAM', name: 'Assam', zoneCode: 'NORTH_EAST', zoneName: 'North East Zone', kind: 'state' },
  { code: 'BIHAR', name: 'Bihar', zoneCode: 'EAST', zoneName: 'East Zone', kind: 'state' },
  { code: 'CHANDIGARH', name: 'Chandigarh', zoneCode: 'NORTH', zoneName: 'North Zone', kind: 'ut' },
  { code: 'CHHATTISGARH', name: 'Chhattisgarh', zoneCode: 'CENTRAL', zoneName: 'Central Zone', kind: 'state' },
  { code: 'DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU', name: 'Dadra and Nagar Haveli and Daman and Diu', zoneCode: 'WEST', zoneName: 'West Zone', kind: 'ut' },
  { code: 'DELHI', name: 'Delhi', zoneCode: 'NORTH', zoneName: 'North Zone', kind: 'ut' },
  { code: 'GOA', name: 'Goa', zoneCode: 'WEST', zoneName: 'West Zone', kind: 'state' },
  { code: 'GUJARAT', name: 'Gujarat', zoneCode: 'WEST', zoneName: 'West Zone', kind: 'state' },
  { code: 'HARYANA', name: 'Haryana', zoneCode: 'NORTH', zoneName: 'North Zone', kind: 'state' },
  { code: 'HIMACHAL_PRADESH', name: 'Himachal Pradesh', zoneCode: 'NORTH', zoneName: 'North Zone', kind: 'state' },
  { code: 'JAMMU_AND_KASHMIR', name: 'Jammu and Kashmir', zoneCode: 'NORTH', zoneName: 'North Zone', kind: 'ut' },
  { code: 'JHARKHAND', name: 'Jharkhand', zoneCode: 'EAST', zoneName: 'East Zone', kind: 'state' },
  { code: 'KARNATAKA', name: 'Karnataka', zoneCode: 'SOUTH', zoneName: 'South Zone', kind: 'state' },
  { code: 'KERALA', name: 'Kerala', zoneCode: 'SOUTH', zoneName: 'South Zone', kind: 'state' },
  { code: 'LADAKH', name: 'Ladakh', zoneCode: 'NORTH', zoneName: 'North Zone', kind: 'ut' },
  { code: 'LAKSHADWEEP', name: 'Lakshadweep', zoneCode: 'SOUTH', zoneName: 'South Zone', kind: 'ut' },
  { code: 'MADHYA_PRADESH', name: 'Madhya Pradesh', zoneCode: 'CENTRAL', zoneName: 'Central Zone', kind: 'state' },
  { code: 'MAHARASHTRA', name: 'Maharashtra', zoneCode: 'WEST', zoneName: 'West Zone', kind: 'state' },
  { code: 'MANIPUR', name: 'Manipur', zoneCode: 'NORTH_EAST', zoneName: 'North East Zone', kind: 'state' },
  { code: 'MEGHALAYA', name: 'Meghalaya', zoneCode: 'NORTH_EAST', zoneName: 'North East Zone', kind: 'state' },
  { code: 'MIZORAM', name: 'Mizoram', zoneCode: 'NORTH_EAST', zoneName: 'North East Zone', kind: 'state' },
  { code: 'NAGALAND', name: 'Nagaland', zoneCode: 'NORTH_EAST', zoneName: 'North East Zone', kind: 'state' },
  { code: 'ODISHA', name: 'Odisha', zoneCode: 'EAST', zoneName: 'East Zone', kind: 'state' },
  { code: 'PUDUCHERRY', name: 'Puducherry', zoneCode: 'SOUTH', zoneName: 'South Zone', kind: 'ut' },
  { code: 'PUNJAB', name: 'Punjab', zoneCode: 'NORTH', zoneName: 'North Zone', kind: 'state' },
  { code: 'RAJASTHAN', name: 'Rajasthan', zoneCode: 'WEST', zoneName: 'West Zone', kind: 'state' },
  { code: 'SIKKIM', name: 'Sikkim', zoneCode: 'EAST', zoneName: 'East Zone', kind: 'state' },
  { code: 'TAMIL_NADU', name: 'Tamil Nadu', zoneCode: 'SOUTH', zoneName: 'South Zone', kind: 'state' },
  { code: 'TELANGANA', name: 'Telangana', zoneCode: 'SOUTH', zoneName: 'South Zone', kind: 'state' },
  { code: 'TRIPURA', name: 'Tripura', zoneCode: 'NORTH_EAST', zoneName: 'North East Zone', kind: 'state' },
  { code: 'UTTAR_PRADESH', name: 'Uttar Pradesh', zoneCode: 'NORTH', zoneName: 'North Zone', kind: 'state' },
  { code: 'UTTARAKHAND', name: 'Uttarakhand', zoneCode: 'NORTH', zoneName: 'North Zone', kind: 'state' },
  { code: 'WEST_BENGAL', name: 'West Bengal', zoneCode: 'EAST', zoneName: 'East Zone', kind: 'state' },
];

/** Common 2-letter state/UT abbreviations to full database code */
const ABBREVIATIONS: Record<string, string> = {
  AN: 'ANDAMAN_AND_NICOBAR_ISLANDS',
  AP: 'ANDHRA_PRADESH',
  AR: 'ARUNACHAL_PRADESH',
  AS: 'ASSAM',
  BR: 'BIHAR',
  CH: 'CHANDIGARH',
  CG: 'CHHATTISGARH',
  CT: 'CHHATTISGARH',
  DD: 'DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU',
  DH: 'DADRA_AND_NAGAR_HAVELI_AND_DAMAN_AND_DIU',
  DL: 'DELHI',
  GA: 'GOA',
  GJ: 'GUJARAT',
  HR: 'HARYANA',
  HP: 'HIMACHAL_PRADESH',
  JK: 'JAMMU_AND_KASHMIR',
  JH: 'JHARKHAND',
  KA: 'KARNATAKA',
  KL: 'KERALA',
  LA: 'LADAKH',
  LD: 'LAKSHADWEEP',
  MP: 'MADHYA_PRADESH',
  MH: 'MAHARASHTRA',
  MN: 'MANIPUR',
  ML: 'MEGHALAYA',
  MZ: 'MIZORAM',
  NL: 'NAGALAND',
  OD: 'ODISHA',
  OR: 'ODISHA',
  PY: 'PUDUCHERRY',
  PB: 'PUNJAB',
  RJ: 'RAJASTHAN',
  SK: 'SIKKIM',
  TN: 'TAMIL_NADU',
  TS: 'TELANGANA',
  TG: 'TELANGANA',
  TR: 'TRIPURA',
  UP: 'UTTAR_PRADESH',
  UK: 'UTTARAKHAND',
  UT: 'UTTARAKHAND',
  WB: 'WEST_BENGAL',
};

/**
 * Matches a state query against database code, name, or standard abbreviation.
 */
export function findStateByQuery(query: string | null | undefined): StateUT | undefined {
  if (!query) return undefined;
  const clean = query.trim().toUpperCase();
  const normalized = clean.replace(/[\s\-_]+/g, '_');

  if (ABBREVIATIONS[clean]) {
    const code = ABBREVIATIONS[clean];
    return INDIAN_STATES_AND_UTS.find((s) => s.code === code);
  }

  return INDIAN_STATES_AND_UTS.find(
    (s) =>
      s.code === normalized ||
      s.code === clean ||
      s.name.toUpperCase() === clean ||
      s.name.toUpperCase().replace(/[\s\-_]+/g, '_') === normalized,
  );
}

/**
 * Resolves the regional zone for a given state code or name.
 */
export function getZoneForState(stateCodeOrName: string | null | undefined): {
  zoneCode: string;
  zoneName: string;
} | null {
  const state = findStateByQuery(stateCodeOrName);
  if (!state) return null;
  return {
    zoneCode: state.zoneCode,
    zoneName: state.zoneName,
  };
}
