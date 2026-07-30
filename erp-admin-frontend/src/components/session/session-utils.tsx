import { Tag } from 'antd';

/**
 * Format date string to localized time; empty values show '-'
 */
export function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleString() : '-';
}

/**
 * Rating tag component: red/gold/green Tag based on value.
 */
export function RatingTag({ value }: { value: number | null | undefined }) {
  if (value == null) return <Tag>N/A</Tag>;
  if (value >= 4) return <Tag color="green">Good</Tag>;
  if (value >= 3) return <Tag color="gold">OK</Tag>;
  return <Tag color="red">Bad</Tag>;
}
