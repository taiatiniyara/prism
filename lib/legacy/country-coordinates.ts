// Approximate country capital coordinates for the legacy `dimUtilities`
// endpoint. prism's `organisations` table has no lat/lng columns, so the Power
// BI map is fed from this static country → capital map. Keyed by `countries.name`
// (UN M49 short name) to match `dimUtilities`'s Country output.
export const COUNTRY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "American Samoa": { lat: -14.2756, lng: -170.702 },
  Australia: { lat: -35.2809, lng: 149.13 },
  "Solomon Islands": { lat: -9.43, lng: 159.95 },
  "Cook Islands": { lat: -21.207, lng: -159.776 },
  Fiji: { lat: -18.1416, lng: 178.4419 },
  "French Polynesia": { lat: -17.535, lng: -149.5696 },
  Kiribati: { lat: 1.4518, lng: 173.032 },
  Guam: { lat: 13.475, lng: 144.749 },
  Nauru: { lat: -0.5477, lng: 166.9209 },
  "New Caledonia": { lat: -22.2758, lng: 166.458 },
  Vanuatu: { lat: -17.7333, lng: 168.3167 },
  "New Zealand": { lat: -41.2865, lng: 174.7762 },
  Niue: { lat: -19.0554, lng: -169.9179 },
  "Northern Mariana Islands": { lat: 15.185, lng: 145.747 },
  "Micronesia (Federated States of)": { lat: 6.9167, lng: 158.1583 },
  "Marshall Islands": { lat: 7.1164, lng: 171.188 },
  Palau: { lat: 7.5, lng: 134.6242 },
  "Papua New Guinea": { lat: -9.4438, lng: 147.1803 },
  Philippines: { lat: 14.5995, lng: 120.9842 },
  Pitcairn: { lat: -25.0663, lng: -130.1015 },
  Tokelau: { lat: -8.5411, lng: -172.5158 },
  Tonga: { lat: -21.1394, lng: -175.2049 },
  Tuvalu: { lat: -8.5167, lng: 179.2 },
  "United States of America": { lat: 38.9072, lng: -77.0369 },
  "Wallis and Futuna Islands": { lat: -13.2827, lng: -176.177 },
  Samoa: { lat: -13.85, lng: -171.75 },
};

export function getCountryCoordinates(
  countryName: string | undefined,
): { lat: number; lng: number } {
  const coords = countryName ? COUNTRY_COORDINATES[countryName] : undefined;
  return coords ?? { lat: 0, lng: 0 };
}
