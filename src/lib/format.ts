export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
  return formatted;
}

export function formatNumber(amount: number, decimals = 2): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount || 0);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function todayISODate(): string {
  return toISODate(new Date());
}

export function firstDayOfMonth(): string {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function lastDayOfMonth(): string {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function normalizeVehicleNumber(num: string): string {
  return num.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
}

export function quintalsFromWeight(weight: number, unit: string): number {
  if (unit === 'kg') return weight / 100;
  if (unit === 'quintal') return weight;
  if (unit === 'ton') return weight * 10;
  return weight;
}

export function calculateCustomerFreight(
  rateType: 'fixed' | 'per_quintal' | 'per_kg' | 'per_ton',
  appliedRate: number,
  quantity: number | null,
  quantityUnit: string | null
): number {
  if (rateType === 'fixed') return appliedRate;
  if (!quantity || !quantityUnit) return 0;

  // Convert the entered quantity to the unit matching the rate type
  let valueInRateUnit: number;

  if (rateType === 'per_kg') {
    // Convert quantity to kg
    valueInRateUnit = weightInKg(quantity, quantityUnit);
  } else if (rateType === 'per_quintal') {
    valueInRateUnit = quintalsFromWeight(quantity, quantityUnit);
  } else if (rateType === 'per_ton') {
    valueInRateUnit = weightInTons(quantity, quantityUnit);
  } else {
    return 0;
  }

  return Math.round(valueInRateUnit * appliedRate * 100) / 100;
}

export function weightInKg(weight: number, unit: string): number {
  if (unit === 'kg') return weight;
  if (unit === 'quintal') return weight * 100;
  if (unit === 'ton') return weight * 1000;
  return weight;
}

export function weightInTons(weight: number, unit: string): number {
  if (unit === 'ton') return weight;
  if (unit === 'quintal') return weight / 10;
  if (unit === 'kg') return weight / 1000;
  return weight;
}

export function calculateBaseFreight(
  rateType: 'fixed' | 'per_quintal' | 'per_kg' | 'per_ton',
  rateValue: number,
  weight: number | null,
  weightUnit: string | null
): number {
  if (rateType === 'fixed') return rateValue;
  if (!weight || !weightUnit) return 0;
  return calculateCustomerFreight(rateType, rateValue, weight, weightUnit);
}

export function calculateFinalFreight(
  baseFreight: number,
  additional: number,
  deduction: number
): number {
  return Math.round((baseFreight + additional - deduction) * 100) / 100;
}

export function calculateTripMargin(
  customerFreight: number,
  truckOwnerCost: number,
  expenses: number
): number {
  return Math.round((customerFreight - truckOwnerCost - expenses) * 100) / 100;
}

export function downloadCSV(filename: string, rows: (string | number)[][]): void {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
