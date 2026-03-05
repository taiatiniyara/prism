export function formatLabel(input: string): string {
  return (
    input
      // Replace underscores with spaces
      .replace(/_/g, " ")
      // Remove standalone "id" words (case-insensitive)
      .replace(/\bid\b/gi, "")
      // Split into words, filter out empties
      .split(" ")
      .filter(Boolean)
      // Capitalize each word
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      // Join back with spaces
      .join(" ")
  );
}

export function createVariableName(str: string): string {
  // Convert to lowercase, replace spaces with underscores, and remove non-alphanumeric characters
  return str
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}
