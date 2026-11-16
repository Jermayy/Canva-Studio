/**
 * Built-in sticker artwork, drawn for this app as simple SVG on a
 * 100x100 grid. Bundled so the library works offline.
 */

export type StickerCategory = 'party' | 'birthday' | 'christmas' | 'general';

export interface Sticker {
  id: string;
  name: string;
  category: StickerCategory;
  svg: string;
}

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

export const STICKERS: readonly Sticker[] = [
  {
    id: 'balloon-red',
    name: 'Red balloon',
    category: 'birthday',
    svg: svg(
      '<path d="M50 72 C50 80 44 84 48 96" stroke="#555" stroke-width="1.5" fill="none"/>' +
        '<ellipse cx="50" cy="38" rx="26" ry="32" fill="#E63946"/>' +
        '<path d="M45 69 L55 69 L50 75 Z" fill="#C1121F"/>' +
        '<ellipse cx="40" cy="26" rx="6" ry="10" fill="#FFFFFF" opacity="0.45"/>',
    ),
  },
  {
    id: 'balloon-blue',
    name: 'Blue balloon',
    category: 'birthday',
    svg: svg(
      '<path d="M50 72 C50 80 56 84 52 96" stroke="#555" stroke-width="1.5" fill="none"/>' +
        '<ellipse cx="50" cy="38" rx="26" ry="32" fill="#4361EE"/>' +
        '<path d="M45 69 L55 69 L50 75 Z" fill="#3A0CA3"/>' +
        '<ellipse cx="40" cy="26" rx="6" ry="10" fill="#FFFFFF" opacity="0.45"/>',
    ),
  },
  {
    id: 'birthday-cake',
    name: 'Birthday cake',
    category: 'birthday',
    svg: svg(
      '<rect x="18" y="52" width="64" height="34" rx="4" fill="#F4A261"/>' +
        '<path d="M18 60 Q26 68 34 60 Q42 68 50 60 Q58 68 66 60 Q74 68 82 60 L82 52 L18 52 Z" fill="#FFF1E6"/>' +
        '<rect x="12" y="84" width="76" height="6" rx="3" fill="#B5838D"/>' +
        '<rect x="30" y="34" width="5" height="18" fill="#90E0EF"/>' +
        '<rect x="47.5" y="34" width="5" height="18" fill="#FFB4A2"/>' +
        '<rect x="65" y="34" width="5" height="18" fill="#B9FBC0"/>' +
        '<path d="M32.5 24 Q36 30 32.5 33 Q29 30 32.5 24 Z" fill="#FFB703"/>' +
        '<path d="M50 24 Q53.5 30 50 33 Q46.5 30 50 24 Z" fill="#FFB703"/>' +
        '<path d="M67.5 24 Q71 30 67.5 33 Q64 30 67.5 24 Z" fill="#FFB703"/>',
    ),
  },
  {
    id: 'gift-box',
    name: 'Gift box',
    category: 'party',
    svg: svg(
      '<rect x="16" y="42" width="68" height="46" rx="3" fill="#2A9D8F"/>' +
        '<rect x="12" y="32" width="76" height="14" rx="3" fill="#264653"/>' +
        '<rect x="45" y="32" width="10" height="56" fill="#E9C46A"/>' +
        '<path d="M50 32 C36 14 24 26 40 32 Z" fill="#E9C46A"/>' +
        '<path d="M50 32 C64 14 76 26 60 32 Z" fill="#E9C46A"/>',
    ),
  },
  {
    id: 'party-hat',
    name: 'Party hat',
    category: 'party',
    svg: svg(
      '<path d="M50 10 L80 88 L20 88 Z" fill="#9B5DE5"/>' +
        '<path d="M42 31 L58 31 L62 42 L38 42 Z" fill="#F15BB5"/>' +
        '<path d="M33 54 L67 54 L71 65 L29 65 Z" fill="#FEE440"/>' +
        '<circle cx="50" cy="10" r="7" fill="#00BBF9"/>',
    ),
  },
  {
    id: 'confetti',
    name: 'Confetti',
    category: 'party',
    svg: svg(
      '<rect x="12" y="18" width="8" height="4" transform="rotate(30 16 20)" fill="#F15BB5"/>' +
        '<rect x="70" y="12" width="8" height="4" transform="rotate(-20 74 14)" fill="#00BBF9"/>' +
        '<rect x="40" y="40" width="8" height="4" transform="rotate(60 44 42)" fill="#FEE440"/>' +
        '<rect x="80" y="60" width="8" height="4" transform="rotate(15 84 62)" fill="#9B5DE5"/>' +
        '<rect x="20" y="70" width="8" height="4" transform="rotate(-45 24 72)" fill="#00F5D4"/>' +
        '<circle cx="58" cy="78" r="3" fill="#F15BB5"/><circle cx="30" cy="44" r="3" fill="#00BBF9"/>' +
        '<circle cx="64" cy="34" r="3" fill="#9B5DE5"/><circle cx="86" cy="86" r="3" fill="#FEE440"/>' +
        '<circle cx="10" cy="90" r="3" fill="#00F5D4"/>',
    ),
  },
  {
    id: 'gold-star',
    name: 'Gold star',
    category: 'general',
    svg: svg(
      '<path d="M50 6 L62 38 L96 38 L68 58 L79 92 L50 72 L21 92 L32 58 L4 38 L38 38 Z" fill="#FFC300" stroke="#E09F00" stroke-width="2"/>',
    ),
  },
  {
    id: 'heart',
    name: 'Heart',
    category: 'general',
    svg: svg(
      '<path d="M50 88 C20 66 8 50 8 32 C8 18 19 8 32 8 C40 8 46 12 50 19 C54 12 60 8 68 8 C81 8 92 18 92 32 C92 50 80 66 50 88 Z" fill="#EF476F"/>',
    ),
  },
  {
    id: 'christmas-tree',
    name: 'Christmas tree',
    category: 'christmas',
    svg: svg(
      '<rect x="44" y="80" width="12" height="14" fill="#7F5539"/>' +
        '<path d="M50 8 L74 40 L62 40 L82 64 L66 64 L88 82 L12 82 L34 64 L18 64 L38 40 L26 40 Z" fill="#2D6A4F"/>' +
        '<path d="M50 2 L53 9 L60 9 L54 13 L56 20 L50 16 L44 20 L46 13 L40 9 L47 9 Z" fill="#FFD60A"/>' +
        '<circle cx="42" cy="38" r="3" fill="#E63946"/><circle cx="58" cy="52" r="3" fill="#FFD60A"/>' +
        '<circle cx="36" cy="66" r="3" fill="#4CC9F0"/><circle cx="64" cy="74" r="3" fill="#E63946"/>',
    ),
  },
  {
    id: 'snowflake',
    name: 'Snowflake',
    category: 'christmas',
    svg: svg(
      '<g stroke="#90E0EF" stroke-width="5" stroke-linecap="round" fill="none">' +
        '<path d="M50 8 V92 M14 29 L86 71 M14 71 L86 29"/>' +
        '<path d="M40 16 L50 26 L60 16 M40 84 L50 74 L60 84"/>' +
        '<path d="M18 42 L30 36 L26 22 M82 58 L70 64 L74 78"/>' +
        '<path d="M18 58 L30 64 L26 78 M82 42 L70 36 L74 22"/></g>',
    ),
  },
  {
    id: 'bauble',
    name: 'Bauble',
    category: 'christmas',
    svg: svg(
      '<path d="M50 4 Q58 4 58 12" stroke="#B08968" stroke-width="2" fill="none"/>' +
        '<rect x="42" y="12" width="16" height="10" rx="2" fill="#ADB5BD"/>' +
        '<circle cx="50" cy="58" r="36" fill="#D00000"/>' +
        '<path d="M16 52 Q50 66 84 52" stroke="#FFD60A" stroke-width="5" fill="none"/>' +
        '<ellipse cx="36" cy="42" rx="7" ry="11" fill="#FFFFFF" opacity="0.35"/>',
    ),
  },
  {
    id: 'candy-cane',
    name: 'Candy cane',
    category: 'christmas',
    svg: svg(
      '<path d="M62 94 V36 A16 16 0 0 0 30 36" stroke="#FFFFFF" stroke-width="12" fill="none" stroke-linecap="round"/>' +
        '<path d="M62 94 V36 A16 16 0 0 0 30 36" stroke="#D00000" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="7 7"/>',
    ),
  },
];

const STICKERS_BY_ID = new Map(
  STICKERS.map((sticker) => [sticker.id, sticker]),
);

export function findSticker(id: string): Sticker | undefined {
  return STICKERS_BY_ID.get(id);
}

/** Data URL for a sticker, usable in <img>, SVG <image> and Konva. */
export function stickerDataUrl(sticker: Sticker): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sticker.svg)}`;
}
