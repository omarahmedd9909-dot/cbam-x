/**
 * CBAM Emissions Calculation Engine
 *
 * Implements EU CBAM Regulation (EU) 2023/956 embedded emission rules:
 *   - Direct emissions: from production process fuels & process reactions
 *   - Indirect emissions: from purchased electricity
 *   - Total embedded = direct + indirect per unit produced
 *
 * Framework-agnostic: calculation_rules JSON drives formula selection.
 */

import type {
  EmissionCalculation,
  DirectEmissionInputs,
  IndirectEmissionInputs,
  CalculationLogEntry,
  CalculationMethod,
  EmissionFactor,
  IndustrySector,
} from '@/types/domain';

// Fuel emission factors (tCO2e per GJ) — EU default values
// Source: IPCC 2006 Guidelines Vol. 2
const FUEL_FACTORS: Record<string, { factor: number; unit: string; description: string }> = {
  natural_gas:      { factor: 0.05622, unit: 'tCO2e/GJ', description: 'Natural gas' },
  coal_bituminous:  { factor: 0.09460, unit: 'tCO2e/GJ', description: 'Bituminous coal' },
  coal_coking:      { factor: 0.09460, unit: 'tCO2e/GJ', description: 'Coking coal' },
  coke_oven_gas:    { factor: 0.04415, unit: 'tCO2e/GJ', description: 'Coke oven gas' },
  blast_furnace_gas:{ factor: 0.26012, unit: 'tCO2e/GJ', description: 'Blast furnace gas' },
  heavy_fuel_oil:   { factor: 0.07768, unit: 'tCO2e/GJ', description: 'Heavy fuel oil' },
  diesel:           { factor: 0.07390, unit: 'tCO2e/GJ', description: 'Diesel/gas oil' },
  lpg:              { factor: 0.06289, unit: 'tCO2e/GJ', description: 'Liquefied petroleum gas' },
  biomass:          { factor: 0.00000, unit: 'tCO2e/GJ', description: 'Biomass (zero-rated)' },
};

// Country electricity emission factors (tCO2e/MWh) — EU defaults
const COUNTRY_GRID_FACTORS: Record<string, number> = {
  EG: 0.494, // Egypt
  TR: 0.454, // Turkey
  IN: 0.708, // India
  CN: 0.581, // China
  SA: 0.648, // Saudi Arabia
  AE: 0.456, // UAE
  MA: 0.637, // Morocco
  ZA: 0.928, // South Africa
  EU: 0.276, // EU average
  DEFAULT: 0.487, // Global default per CBAM regulation
};

export interface CalculationInput {
  org_id: string;
  product_id: string;
  facility_id?: string;
  period: string;
  method: CalculationMethod;
  production_volume: number; // units produced (tonnes or MWh)
  country: string; // facility country — for default electricity factor
  sector: IndustrySector;
  direct_inputs: DirectEmissionInputs;
  indirect_inputs: IndirectEmissionInputs;
  notes?: string;
  direct_factor?: EmissionFactor | null; // override: use specific DB factor
  indirect_factor?: EmissionFactor | null;
}

export interface CalculationResult {
  direct_emissions: number; // tCO2e per unit
  indirect_emissions: number; // tCO2e per unit
  total_embedded: number; // tCO2e per unit
  total_co2e: number; // total tCO2e for period
  calculation_log: CalculationLogEntry[];
  method_used: CalculationMethod;
  warnings: string[];
}

/**
 * Compute embedded emissions for a CBAM product.
 * Returns a structured result with full audit trail.
 */
export function calculateEmbeddedEmissions(
  input: CalculationInput,
  defaultFactors: Record<IndustrySector, number>
): CalculationResult {
  const log: CalculationLogEntry[] = [];
  const warnings: string[] = [];
  let stepNum = 1;

  function logStep(
    description: string,
    formula: string,
    inputs: Record<string, number | string>,
    result: number,
    unit: string
  ): void {
    log.push({
      step: stepNum++,
      description,
      formula,
      inputs,
      result: round(result, 6),
      unit,
      timestamp: new Date().toISOString(),
    });
  }

  // ----------------------------------------------------------------
  // STEP 1: Determine calculation method
  // ----------------------------------------------------------------
  const isActual = input.method === 'actual';
  const isDefault = input.method === 'default';

  if (isDefault) {
    warnings.push(
      'Using EU default values. Actual monitored data is strongly recommended — default values carry higher financial risk.'
    );
  }

  // ----------------------------------------------------------------
  // STEP 2: Direct emissions
  // ----------------------------------------------------------------
  let directEmissions = 0;

  if (isDefault || (!input.direct_inputs.fuel_type && !input.direct_inputs.process_emissions)) {
    // Use sector default factor (tCO2e/t)
    const defaultFactor = defaultFactors[input.sector] ?? 4.9;
    directEmissions = defaultFactor;
    logStep(
      'Direct emissions — EU sector default value',
      'EF_direct = sector_default_factor',
      { sector: input.sector, default_factor: defaultFactor },
      directEmissions,
      'tCO2e/unit'
    );
    if (isActual) {
      warnings.push('No fuel data provided — falling back to EU default for direct emissions.');
    }
  } else {
    // Actual calculation from fuel consumption data
    const {
      fuel_type,
      fuel_consumption,
      fuel_unit = 'GJ',
      oxidation_factor = 0.995,
      process_emissions = 0,
    } = input.direct_inputs;

    let fuelCO2e = 0;

    if (fuel_type && fuel_consumption && fuel_consumption > 0) {
      const fuelFactor = FUEL_FACTORS[fuel_type];
      if (!fuelFactor) {
        warnings.push(`Unknown fuel type '${fuel_type}' — skipped from calculation.`);
      } else {
        // Convert to GJ if needed
        let consumptionGJ = fuel_consumption;
        if (fuel_unit === 'MWh') consumptionGJ = fuel_consumption * 3.6;
        if (fuel_unit === 'toe') consumptionGJ = fuel_consumption * 41.868;
        if (fuel_unit === 'm3') consumptionGJ = fuel_consumption * 0.0388; // natural gas approximate

        fuelCO2e = consumptionGJ * fuelFactor.factor * oxidation_factor;

        logStep(
          'Direct emissions — fuel combustion',
          'E_fuel = consumption_GJ × emission_factor × oxidation_factor',
          {
            fuel_type,
            consumption_GJ: round(consumptionGJ, 4),
            emission_factor: fuelFactor.factor,
            oxidation_factor,
          },
          fuelCO2e,
          'tCO2e/unit'
        );
      }
    }

    // Process emissions (e.g. limestone calcination for cement)
    if (process_emissions > 0) {
      logStep(
        'Direct emissions — process reactions',
        'E_process = process_specific_emissions',
        { process_emissions },
        process_emissions,
        'tCO2e/unit'
      );
    }

    directEmissions = fuelCO2e + process_emissions;

    logStep(
      'Direct emissions total',
      'EF_direct = E_fuel + E_process',
      { E_fuel: round(fuelCO2e, 6), E_process: process_emissions },
      directEmissions,
      'tCO2e/unit'
    );
  }

  // ----------------------------------------------------------------
  // STEP 3: Indirect emissions (electricity)
  // ----------------------------------------------------------------
  let indirectEmissions = 0;

  if (!input.indirect_inputs.electricity_consumption_mwh ||
      input.indirect_inputs.electricity_consumption_mwh === 0) {
    // No electricity → zero indirect
    logStep(
      'Indirect emissions — no electricity consumption reported',
      'EF_indirect = 0',
      {},
      0,
      'tCO2e/unit'
    );
  } else if (isDefault) {
    // Default: use country grid factor
    const gridFactor =
      input.indirect_inputs.electricity_emission_factor ??
      COUNTRY_GRID_FACTORS[input.country] ??
      COUNTRY_GRID_FACTORS.DEFAULT!;
    const mwh = input.indirect_inputs.electricity_consumption_mwh;

    indirectEmissions = mwh * gridFactor;

    logStep(
      'Indirect emissions — electricity (country default grid factor)',
      'EF_indirect = electricity_MWh × country_grid_factor',
      { electricity_MWh: mwh, grid_factor: gridFactor, country: input.country },
      indirectEmissions,
      'tCO2e/unit'
    );
  } else {
    // Actual: use provided or country-specific factor
    const gridFactor =
      input.indirect_inputs.electricity_emission_factor ??
      COUNTRY_GRID_FACTORS[input.country] ??
      COUNTRY_GRID_FACTORS.DEFAULT!;
    const mwh = input.indirect_inputs.electricity_consumption_mwh;

    if (!input.indirect_inputs.electricity_emission_factor) {
      warnings.push(
        `No electricity emission factor provided — using country default for ${input.country} (${gridFactor} tCO2e/MWh).`
      );
    }

    indirectEmissions = mwh * gridFactor;

    logStep(
      'Indirect emissions — electricity consumption',
      'EF_indirect = electricity_MWh × emission_factor',
      { electricity_MWh: mwh, emission_factor: gridFactor },
      indirectEmissions,
      'tCO2e/unit'
    );
  }

  // Add heat/cooling if provided
  if (input.indirect_inputs.heat_consumption_gj && input.indirect_inputs.heat_consumption_gj > 0) {
    const heatFactor = 0.0565; // tCO2e/GJ — EU default for purchased heat
    const heatCO2e = input.indirect_inputs.heat_consumption_gj * heatFactor;
    indirectEmissions += heatCO2e;

    logStep(
      'Indirect emissions — purchased heat',
      'E_heat = heat_GJ × heat_emission_factor',
      {
        heat_GJ: input.indirect_inputs.heat_consumption_gj,
        heat_emission_factor: heatFactor,
      },
      heatCO2e,
      'tCO2e/unit'
    );
  }

  // ----------------------------------------------------------------
  // STEP 4: Total embedded emissions
  // ----------------------------------------------------------------
  const totalEmbedded = directEmissions + indirectEmissions;

  logStep(
    'Total embedded emissions per unit',
    'SEE = EF_direct + EF_indirect',
    {
      EF_direct: round(directEmissions, 6),
      EF_indirect: round(indirectEmissions, 6),
    },
    totalEmbedded,
    'tCO2e/unit'
  );

  // ----------------------------------------------------------------
  // STEP 5: Total CO2e for production volume
  // ----------------------------------------------------------------
  const totalCO2e = totalEmbedded * input.production_volume;

  logStep(
    'Total embedded CO2e for reporting period',
    'total_CO2e = SEE × production_volume',
    {
      SEE: round(totalEmbedded, 6),
      production_volume: input.production_volume,
    },
    totalCO2e,
    'tCO2e'
  );

  return {
    direct_emissions: round(directEmissions, 6),
    indirect_emissions: round(indirectEmissions, 6),
    total_embedded: round(totalEmbedded, 6),
    total_co2e: round(totalCO2e, 4),
    calculation_log: log,
    method_used: isActual && log.some((l) => l.description.includes('default'))
      ? 'conservative'
      : input.method,
    warnings,
  };
}

/**
 * Estimate the CBAM financial liability for a submission.
 * CBAM certificate price tracks EU ETS price.
 */
export function estimateCbamLiability(
  totalCO2e: number,
  euEtsPriceEur: number, // current EU ETS price per tCO2e
  alreadyPaidCarbonPrice: number = 0 // carbon price already paid in origin country
): {
  gross_liability_eur: number;
  net_liability_eur: number;
  certificates_needed: number;
  already_paid_deduction: number;
} {
  const grossLiability = totalCO2e * euEtsPriceEur;
  const deduction = totalCO2e * alreadyPaidCarbonPrice;
  const netLiability = Math.max(0, grossLiability - deduction);

  return {
    gross_liability_eur: round(grossLiability, 2),
    net_liability_eur: round(netLiability, 2),
    certificates_needed: Math.ceil(totalCO2e), // CBAM certificates = whole tonnes
    already_paid_deduction: round(deduction, 2),
  };
}

/**
 * Validate calculation inputs before submission.
 */
export function validateCalculationInputs(
  method: CalculationMethod,
  direct: DirectEmissionInputs,
  indirect: IndirectEmissionInputs,
  productionVolume: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (productionVolume <= 0) {
    errors.push('Production volume must be greater than zero.');
  }

  if (method === 'actual') {
    if (
      !direct.fuel_type &&
      !direct.process_emissions &&
      !direct.heat_input
    ) {
      errors.push(
        'Actual method requires at least one direct emission input (fuel type, process emissions, or heat input).'
      );
    }

    if (direct.fuel_type && (!direct.fuel_consumption || direct.fuel_consumption <= 0)) {
      errors.push('Fuel consumption must be provided when fuel type is specified.');
    }

    if (
      direct.oxidation_factor !== undefined &&
      (direct.oxidation_factor < 0.9 || direct.oxidation_factor > 1.0)
    ) {
      errors.push('Oxidation factor must be between 0.9 and 1.0.');
    }
  }

  if (
    indirect.electricity_consumption_mwh !== undefined &&
    indirect.electricity_consumption_mwh < 0
  ) {
    errors.push('Electricity consumption cannot be negative.');
  }

  return { valid: errors.length === 0, errors };
}

function round(value: number, decimals: number): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

export { FUEL_FACTORS, COUNTRY_GRID_FACTORS };
