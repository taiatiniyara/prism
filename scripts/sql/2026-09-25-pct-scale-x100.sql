-- Track B item (2): store '%'-unit proportion KPIs on a 0-100 scale (Eugene, 2026-09-24).
-- Wrap each multi-input ratio (proportion by construction) with *100 so unit='%' reads as a true percent.
-- Excludes single-input entered-percent pass-throughs (Urban Population etc.) and no-formula KPIs.
-- Idempotent: skips any formula already ending in ')*100'. 48 KPIs.

BEGIN;

-- [23] Fuel Expenditure
UPDATE kpi_definitions SET formula = '(om_costs_fuel__oil / electricity_total_costs) * 100', updated_at = now() WHERE id = 23 AND formula = 'om_costs_fuel__oil / electricity_total_costs';

-- [24] Generation O&M Costs
UPDATE kpi_definitions SET formula = '(om_costs_generation / electricity_total_costs) * 100', updated_at = now() WHERE id = 24 AND formula = 'om_costs_generation / electricity_total_costs';

-- [25] Power Purchase Costs
UPDATE kpi_definitions SET formula = '(power_purchase_costs / total_costs) * 100', updated_at = now() WHERE id = 25 AND formula = 'power_purchase_costs / total_costs';

-- [26] Transmission and Distribution O&M Costs
UPDATE kpi_definitions SET formula = '(( om_costs_transmission + om_costs_distribution ) / total_costs) * 100', updated_at = now() WHERE id = 26 AND formula = '( om_costs_transmission + om_costs_distribution ) / total_costs';

-- [27] Other Labor Expenditure
UPDATE kpi_definitions SET formula = '(staff_costs_other_labor_expenditure / service_total_costs) * 100', updated_at = now() WHERE id = 27 AND formula = 'staff_costs_other_labor_expenditure / service_total_costs';

-- [28] Other Expenditure
UPDATE kpi_definitions SET formula = '(service_other_operating_expenses / service_total_costs) * 100', updated_at = now() WHERE id = 28 AND formula = 'service_other_operating_expenses / service_total_costs';

-- [30] Generation Labor Costs
UPDATE kpi_definitions SET formula = '(om_costs_generation / electricity_total_costs) * 100', updated_at = now() WHERE id = 30 AND formula = 'om_costs_generation / electricity_total_costs';

-- [31] Transmission and Distribution Labor Costs
UPDATE kpi_definitions SET formula = '(( staff_costs_transmission + staff_costs_distribution ) / total_costs) * 100', updated_at = now() WHERE id = 31 AND formula = '( staff_costs_transmission + staff_costs_distribution ) / total_costs';

-- [32] Other Duty and Taxes
UPDATE kpi_definitions SET formula = '(apportioned_cost_duty_and_taxes_others / service_total_costs) * 100', updated_at = now() WHERE id = 32 AND formula = 'apportioned_cost_duty_and_taxes_others / service_total_costs';

-- [34] Operating Cost Recovery
UPDATE kpi_definitions SET formula = '(service_revenue / ( service_cost_of_sales + service_other_operating_expenses - service_bad_debt_expense + service_income_tax )) * 100', updated_at = now() WHERE id = 34 AND formula = 'service_revenue / ( service_cost_of_sales + service_other_operating_expenses - service_bad_debt_expense + service_income_tax )';

-- [35] Operating Ratio
UPDATE kpi_definitions SET formula = '(( service_cost_of_sales + service_other_operating_expenses ) / service_revenue) * 100', updated_at = now() WHERE id = 35 AND formula = '( service_cost_of_sales + service_other_operating_expenses ) / service_revenue';

-- [36] Operating Cost Covered by Subsidies
UPDATE kpi_definitions SET formula = '(service_government_subsidies / ( service_cost_of_sales + service_other_operating_expenses - service_bad_debt_expense + service_income_tax )) * 100', updated_at = now() WHERE id = 36 AND formula = 'service_government_subsidies / ( service_cost_of_sales + service_other_operating_expenses - service_bad_debt_expense + service_income_tax )';

-- [40] Return on Assets
UPDATE kpi_definitions SET formula = '(service_profit / service_total_assets) * 100', updated_at = now() WHERE id = 40 AND formula = 'service_profit / service_total_assets';

-- [41] Return on Equity
UPDATE kpi_definitions SET formula = '(profit / total_equity) * 100', updated_at = now() WHERE id = 41 AND formula = 'profit / total_equity';

-- [42] EBITDA Margin
UPDATE kpi_definitions SET formula = '(( electricity_revenue + electricity_other_income - electricity_cost_of_sales - electricity_other_operating_expenses ) / electricity_revenue) * 100', updated_at = now() WHERE id = 42 AND formula = '( electricity_revenue + electricity_other_income - electricity_cost_of_sales - electricity_other_operating_expenses ) / electricity_revenue';

-- [43] EBIT Margin
UPDATE kpi_definitions SET formula = '(( electricity_revenue + electricity_other_income - electricity_cost_of_sales - electricity_other_operating_expenses - electricity_depreciation_expense - electricity_amortization_expenses ) / electricity_revenue) * 100', updated_at = now() WHERE id = 43 AND formula = '( electricity_revenue + electricity_other_income - electricity_cost_of_sales - electricity_other_operating_expenses - electricity_depreciation_expense - electricity_amortization_expenses ) / electricity_revenue';

-- [44] Profit Margin
UPDATE kpi_definitions SET formula = '(service_profit / service_revenue) * 100', updated_at = now() WHERE id = 44 AND formula = 'service_profit / service_revenue';

-- [64] Employees Male %
UPDATE kpi_definitions SET formula = '(employees_male / employees_total) * 100', updated_at = now() WHERE id = 64 AND formula = 'employees_male / employees_total';

-- [65] Employees Female %
UPDATE kpi_definitions SET formula = '(employees_female / employees_total) * 100', updated_at = now() WHERE id = 65 AND formula = 'employees_female / employees_total';

-- [67] Executive Employees Male %
UPDATE kpi_definitions SET formula = '(executive_employees_male / executive_employees_total) * 100', updated_at = now() WHERE id = 67 AND formula = 'executive_employees_male / executive_employees_total';

-- [68] Executive Employees Female %
UPDATE kpi_definitions SET formula = '(executive_employees_female / executive_employees_total) * 100', updated_at = now() WHERE id = 68 AND formula = 'executive_employees_female / executive_employees_total';

-- [70] Technical Employees Male %
UPDATE kpi_definitions SET formula = '(technical_employees_male / technical_employees_total) * 100', updated_at = now() WHERE id = 70 AND formula = 'technical_employees_male / technical_employees_total';

-- [71] Technical Employees Female %
UPDATE kpi_definitions SET formula = '(technical_employees_female / technical_employees_total) * 100', updated_at = now() WHERE id = 71 AND formula = 'technical_employees_female / technical_employees_total';

-- [73] Finance Employees Male %
UPDATE kpi_definitions SET formula = '(finance_employees_male / finance_employees_total) * 100', updated_at = now() WHERE id = 73 AND formula = 'finance_employees_male / finance_employees_total';

-- [74] Finance Employees Female %
UPDATE kpi_definitions SET formula = '(finance_employees_female / finance_employees_total) * 100', updated_at = now() WHERE id = 74 AND formula = 'finance_employees_female / finance_employees_total';

-- [76] HR Employees Male %
UPDATE kpi_definitions SET formula = '(human_resource_employees_male / human_resource_employees_total) * 100', updated_at = now() WHERE id = 76 AND formula = 'human_resource_employees_male / human_resource_employees_total';

-- [77] HR Employees Female %
UPDATE kpi_definitions SET formula = '(human_resource_employees_female / human_resource_employees_total) * 100', updated_at = now() WHERE id = 77 AND formula = 'human_resource_employees_female / human_resource_employees_total';

-- [79] PR Marketing and CustService Employees Male %
UPDATE kpi_definitions SET formula = '(pr_and_marketing_employees_male / pr_and_marketing_employees_total) * 100', updated_at = now() WHERE id = 79 AND formula = 'pr_and_marketing_employees_male / pr_and_marketing_employees_total';

-- [80] PR Marketing and CustService Employees Female %
UPDATE kpi_definitions SET formula = '(pr_and_marketing_employees_female / total_pr_and_marketing_employees) * 100', updated_at = now() WHERE id = 80 AND formula = 'pr_and_marketing_employees_female / total_pr_and_marketing_employees';

-- [82] Administrative Employees Male %
UPDATE kpi_definitions SET formula = '(administrative_employees_male / administrative_employees_total) * 100', updated_at = now() WHERE id = 82 AND formula = 'administrative_employees_male / administrative_employees_total';

-- [83] Administrative Employees Female %
UPDATE kpi_definitions SET formula = '(administrative_employees_female / administrative_employees_total) * 100', updated_at = now() WHERE id = 83 AND formula = 'administrative_employees_female / administrative_employees_total';

-- [85] ICT Employees Male %
UPDATE kpi_definitions SET formula = '(ict_employees_male / ict_employees_total) * 100', updated_at = now() WHERE id = 85 AND formula = 'ict_employees_male / ict_employees_total';

-- [86] ICT Employees Female %
UPDATE kpi_definitions SET formula = '(ict_employees_female / ict_employees_total) * 100', updated_at = now() WHERE id = 86 AND formula = 'ict_employees_female / ict_employees_total';

-- [88] Other Divisions Employees Male %
UPDATE kpi_definitions SET formula = '(other_employees_male / other_employees_total) * 100', updated_at = now() WHERE id = 88 AND formula = 'other_employees_male / other_employees_total';

-- [89] Other Divisions Employees Female %
UPDATE kpi_definitions SET formula = '(other_employees_female / other_employees_total) * 100', updated_at = now() WHERE id = 89 AND formula = 'other_employees_female / other_employees_total';

-- [91] Procurement Employees Male %
UPDATE kpi_definitions SET formula = '(procurement_employees_male / procurement_employees_total) * 100', updated_at = now() WHERE id = 91 AND formula = 'procurement_employees_male / procurement_employees_total';

-- [92] Procurement Employees Female %
UPDATE kpi_definitions SET formula = '(procurement_employees_female / procurement_employees_total) * 100', updated_at = now() WHERE id = 92 AND formula = 'procurement_employees_female / procurement_employees_total';

-- [96] Load Factor
UPDATE kpi_definitions SET formula = '(electricity_demand_average_load / electricity_demand_peak_load) * 100', updated_at = now() WHERE id = 96 AND formula = 'electricity_demand_average_load / electricity_demand_peak_load';

-- [97] Generator Capacity Factor
UPDATE kpi_definitions SET formula = '(electricity_generated / ( rated_capacity * hours_in_period )) * 100', updated_at = now() WHERE id = 97 AND formula = 'electricity_generated / ( rated_capacity * hours_in_period )';

-- [98] Generator Availability Factor
UPDATE kpi_definitions SET formula = '(( hours_in_period - ( downtime_planned_duration + downtime_unplanned_duration ) ) / hours_in_period) * 100', updated_at = now() WHERE id = 98 AND formula = '( hours_in_period - ( downtime_planned_duration + downtime_unplanned_duration ) ) / hours_in_period';

-- [99] Generator Forced Outage Indicator
UPDATE kpi_definitions SET formula = '(( unplanned_downtime_hours * rated_capacity ) / ( hours_in_period * rated_capacity )) * 100', updated_at = now() WHERE id = 99 AND formula = '( unplanned_downtime_hours * rated_capacity ) / ( hours_in_period * rated_capacity )';

-- [100] Generator Planned Outage Indicator
UPDATE kpi_definitions SET formula = '(downtime_planned_duration / ( hours_in_period * rated_capacity )) * 100', updated_at = now() WHERE id = 100 AND formula = 'downtime_planned_duration / ( hours_in_period * rated_capacity )';

-- [103] Station Usage/Station Auxiliaries
UPDATE kpi_definitions SET formula = '(station_auxilliary_usage / electricity_generated) * 100', updated_at = now() WHERE id = 103 AND formula = 'station_auxilliary_usage / electricity_generated';

-- [104] IPP Generation
UPDATE kpi_definitions SET formula = '(electricity_generated_ipp / electricity_generated_total) * 100', updated_at = now() WHERE id = 104 AND formula = 'electricity_generated_ipp / electricity_generated_total';

-- [105] Renewable Energy to Grid
UPDATE kpi_definitions SET formula = '(electricity_generated_from_renewables / total_electricity_generated) * 100', updated_at = now() WHERE id = 105 AND formula = 'electricity_generated_from_renewables / total_electricity_generated';

-- [112] Network Delivery Losses
UPDATE kpi_definitions SET formula = '(( electricity_generated - station_auxilliary_usage - electricity_sold_to_customers ) / electricity_generated) * 100', updated_at = now() WHERE id = 112 AND formula = '( electricity_generated - station_auxilliary_usage - electricity_sold_to_customers ) / electricity_generated';

-- [113] Transformer Utilization Factor
UPDATE kpi_definitions SET formula = '(distribution_average_transformer_load / distribution_total_transformer_capacity) * 100', updated_at = now() WHERE id = 113 AND formula = 'distribution_average_transformer_load / distribution_total_transformer_capacity';

-- [117] Transmission Network Losses
UPDATE kpi_definitions SET formula = '(( electricity_generated - station_auxilliary_usage - transmission_electricity_sold_to_customers - electricity_sold_to_customers ) / ( electricity_generated - station_auxilliary_usage )) * 100', updated_at = now() WHERE id = 117 AND formula = '( electricity_generated - station_auxilliary_usage - transmission_electricity_sold_to_customers - electricity_sold_to_customers ) / ( electricity_generated - station_auxilliary_usage )';

COMMIT;
