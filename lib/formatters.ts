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
