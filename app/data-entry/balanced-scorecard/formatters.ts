export const formatScore = (value: number | null): string => {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value.toFixed(1)}%`;
};

export const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};
