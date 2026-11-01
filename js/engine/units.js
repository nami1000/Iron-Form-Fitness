// Unit conversion. Everything is stored internally in metric:
// kilograms, centimetres, kilocalories, seconds. Conversion happens only at
// the UI edge (input parsing and display).

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const lbToKg = (lb) => lb * KG_PER_LB;
export const kgToLb = (kg) => kg / KG_PER_LB;
export const ftInToCm = (ft, inch = 0) => (ft * 12 + inch) * CM_PER_IN;

export function cmToFtIn(cm) {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, inch };
}

export const round = (n, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Format a body/goal weight held in kg for display. */
export function fmtWeight(kg, units, dp = 1) {
  if (kg == null || Number.isNaN(kg)) return '—';
  return units === 'imperial' ? `${round(kgToLb(kg), dp)} lb` : `${round(kg, dp)} kg`;
}

export function fmtHeight(cm, units) {
  if (units === 'imperial') {
    const { ft, inch } = cmToFtIn(cm);
    return `${ft}′${inch}″`;
  }
  return `${Math.round(cm)} cm`;
}

/** Input from the UI → kg */
export const toKg = (value, units) => (units === 'imperial' ? lbToKg(value) : value);
/** kg → number in display units */
export const fromKg = (kg, units) => (units === 'imperial' ? kgToLb(kg) : kg);
export const weightUnit = (units) => (units === 'imperial' ? 'lb' : 'kg');
