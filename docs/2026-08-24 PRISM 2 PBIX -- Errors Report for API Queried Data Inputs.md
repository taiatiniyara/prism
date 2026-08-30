---
Genre:
  - PRISM QA Note
Relating to:
  - "[[P2314 — PRISM 2 Source Repoint (Power BI Data Connections)]]"
---
## Table-by-Table Check

This is the result of a first cut review of the data as being pushed into the updated queries, looking at the data being pushed into each column of each table as input by the new source APIs.
This check is for flagging where entire columns are empty or do not contain the type of data as expected. This check does not contain a row-by-row or utility-by-utility level parsing of QA against PRISM 1 values.

[[Usage Level]]: OK
[[Dim Country]]: 
	Error: `Fuel Regulation` column is pulling in values of `890` or `892`. *convert managed list id to name
[[Fact Currency]]:
	Error: `CurrencyCode` column is pulling in only `null` or `Local Coastal Tanker Port (LCT)/Small Tanker/Isotainer` or `Units N/A`; expecting 3-letter ISO codes for local currencies. 
[[Dim Accounting]]: OK
[[Dim Utilities]]: OK
[[Dim Service Areas]]: OK
[[Fact Distribution]]: 
	Empty: The following columns are pulling in all `null` values:
		`Distribution Network Unplanned Downtime Events`	*excluded from migration as no values
		`Distribution Network Transformer Capacity`			*values migrated
		`Distribution Network Length`						*measure_id 420 + utility_function_id = 1025
[[Fact FinancialAccounts]]: 	
	Empty: The following columns are pulling in all `null` values:
		`Amortization Expense`								*measure_id 214
		`Amortization Expense USD`							
		`Income Taxes`										*measure_id 220
		`Income Taxes USD`
[[Fact Generation]]: OK
[[Fact Governance]]: 
	Error: Each governance response column is showing either `null` or `false`; missing true/yes values. * measure_ids: 100-113
[[Fact Leadership]]: OK
[[Fact Metering]]: 
	Empty: The following column(s) are pulling in all `null` values:
		`Electricity Customers`								*measure_id 301 + utility_function_id = 1025
[[Fact Safety]]
	Empty: The following column(s) are pulling in all `null` values:
		`Hours Lost to Work Related Injuries`				*measure_id 281
		`Total Hours Worked`								*measure_id 291
[[Fact SAIDI&SAIFI]]
	Empty: The following column(s) are pulling in all `null` values:
		`Total Unplanned Interruptions Customers Affected`	*measure_id 466
		`Total Unplanned Interruptions Events`				*measure_id 465
		`Total Planned Interruptions Customer Minutes`		*measure_id 462
		`Total Planned Interruptions Customers Affected`	*measure_id 461
[[Fact TariffStructure]]: 	
	Empty: All columns are pulling in all `null` values, EXCEPT `ReportType`, `ReportPeriod`, `UtilityID`, `Currency`, and `UsdExchangeRate`.
[[Fact Transmission]]
	Empty: The following column(s) are pulling in all `null` values:
		`Transmission Network Length`						*measure_id 420 + utility_function_id = 1026
		`Transmission Network Customers Served`				*measure_id 301 + utility_function_id = 1026
		`Transmission Electricity Sold to Customers`		*measure_id 302 + utility_function_id = 1026
		`Transmission Network Electricity Sent to Grid`		*measure_id 440 + utility_function_id = 1026
		`Transmission Network Planned Downtime Events`		*measure_id 340 + utility_function_id = 1026
		`Transmission Network Planned Downtime Minutes`		*measure_id 341 + utility_function_id = 1026
		`Transmission Network Unplanned Downtime Events`	*measure_id 342 + utility_function_id = 1026
		`Transmission Network Unplanned Downtime Minutes`	*measure_id 343 + utility_function_id = 1026
		`Transmission Network All Downtime Events`			deleted - is a calculated value; we're only passing raw values
		`Transmission Network All Downtime Minutes`			deleted - is a calculated value; we're only passing raw values
		`FTE Employees in Transmission`						*measure_id 270 + utility_function_id = 1026
[[Fact UtilityCosts]]:
	Empty: All columns are pulling in all `null` values, EXCEPT `ReportType`, `ReportPeriod`, `UtilityID`, `Currency`, and `USD to LCU`.
															*measure_ids 141-149
	Also, need to add column for `Multiplier` to indicate whether currency units were reported in Ones, Tens, Thousands, etc.
[[Fact Employee]]
[[Fact GeneratorsData]]
	Empty: The following column(s) are pulling in all `null` values:
		`Oil for Lubrication`								*measure_id 381
		`Fuel Oil for Diesel Generators`					*measure_id 380 + technology_id = 46
		`Fuel Oil for Heavy Fuel Generators`				*measure_id 380 + technology_id = 48
		`GEN Downtime Unplanned Hours`						*measure_id 333 + relevant technology_id
		`GEN Downtime Planned Hours`						*measure_id 331 + relevant technology_id
		`GEN Electricity Generated`							*measure_id 261 + relevant technology_id
		`GEN Installed Capacity`							*measure_id 260 + relevant technology_id
[[Dim Generators]]
	Empty: The following column(s) are pulling in all `null` values:
		Power Station ID									*source from power_station_id by service_area_id
[[Fact CountryContext]]
	Empty: The following column(s) are pulling in all `null` values:
		`CountryId`											*source from country table
		`AlphaCode2`
		`AlphaCode3`
		`UtilityId`
		`Number of Households`								*measure_id 7
		`National Population`								*measure_id 3
		`Number of Islands`									*measure_id 2
[[Fact UtilityContext]]
	Empty: The following column(s) are pulling in all `null` values:
		`Ownership Type`									*measure_id 50
		`Fuel Supply Access`								*measure_id 15

---
