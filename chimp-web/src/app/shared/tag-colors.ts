/**
 * Shared tag color utilities for consistent tag styling across the application.
 * Colors are assigned deterministically based on the tag name hash.
 */

export interface TagColor {
  bg: string;
  text: string;
  border: string;
}

export const TAG_COLORS: TagColor[] = [
  { bg: '#E3F2FD', text: '#1565C0', border: '#90CAF9' }, // Blue
  { bg: '#F3E5F5', text: '#7B1FA2', border: '#CE93D8' }, // Purple
  { bg: '#E8F5E9', text: '#2E7D32', border: '#A5D6A7' }, // Green
  { bg: '#FFF3E0', text: '#E65100', border: '#FFCC80' }, // Orange
  { bg: '#FCE4EC', text: '#C2185B', border: '#F48FB1' }, // Pink
  { bg: '#E0F7FA', text: '#00838F', border: '#80DEEA' }, // Cyan
  { bg: '#FFF8E1', text: '#F9A825', border: '#FFE082' }, // Amber
  { bg: '#F1F8E9', text: '#558B2F', border: '#C5E1A5' }, // Light Green
  { bg: '#EDE7F6', text: '#512DA8', border: '#B39DDB' }, // Deep Purple
  { bg: '#FFEBEE', text: '#C62828', border: '#EF9A9A' }, // Red
  { bg: '#E8EAF6', text: '#303F9F', border: '#9FA8DA' }, // Indigo
  { bg: '#E0F2F1', text: '#00695C', border: '#80CBC4' }, // Teal
];

/**
 * Get a consistent color for a tag based on its name.
 * Uses a hash function to deterministically assign colors.
 */
export function getTagColor(tag: string): TagColor {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
}
