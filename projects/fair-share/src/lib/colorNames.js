const NAMES = {
  '#E4572E': 'vermilion',
  '#29335C': 'navy',
  '#F3A712': 'amber',
  '#669BBC': 'sky blue',
  '#A8C686': 'sage',
  '#8E5572': 'plum',
  '#2E933C': 'green',
  '#D1495B': 'raspberry',
  '#00798C': 'teal',
  '#6A4C93': 'violet',
};

export const colorName = (hex, i) => NAMES[hex.toUpperCase()] ?? `color ${i + 1}`;
