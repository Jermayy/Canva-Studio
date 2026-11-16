import {
  DESIGN_SCHEMA_VERSION,
  type DesignDocument,
  type DesignElement,
  type ImageElement,
  type TextElement,
} from '@renderer/modules/editor/domain/designModel';
import {
  defaultIdFactory,
  type IdFactory,
} from '@renderer/modules/library/domain/elementFactory';

/**
 * Event templates. Each build produces fresh element ids so two designs
 * made from the same template never share ids.
 */

export type TemplateCategory = 'Birthday' | 'Christmas' | 'Party' | 'Blank';

export interface DesignSize {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const DESIGN_SIZES: readonly DesignSize[] = [
  { id: 'poster-a4', name: 'Poster (A4)', width: 1240, height: 1754 },
  { id: 'square', name: 'Square post', width: 1080, height: 1080 },
  { id: 'story', name: 'Story', width: 1080, height: 1920 },
  { id: 'landscape', name: 'Landscape (16:9)', width: 1920, height: 1080 },
];

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  build: (newId?: IdFactory) => DesignDocument;
}

type TextSpec = Partial<TextElement> & Pick<TextElement, 'text' | 'y'>;

function makeBuilder(width: number, newId: IdFactory) {
  return {
    text: (spec: TextSpec): TextElement => ({
      id: newId(),
      type: 'text',
      x: 80,
      rotation: 0,
      opacity: 1,
      width: width - 160,
      fontFamily: 'Helvetica Neue',
      fontSize: 64,
      fontStyle: 'bold',
      align: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      fill: '#1F1F1F',
      ...spec,
    }),
    sticker: (
      stickerId: string,
      x: number,
      y: number,
      size: number,
      rotation = 0,
    ): ImageElement => ({
      id: newId(),
      type: 'image',
      x,
      y,
      rotation,
      opacity: 1,
      width: size,
      height: size,
      source: { kind: 'sticker', stickerId },
    }),
    rect: (
      spec: Pick<DesignElement, 'x' | 'y'> & {
        width: number;
        height: number;
        fill: string;
        cornerRadius?: number;
        opacity?: number;
      },
    ): DesignElement => ({
      id: newId(),
      type: 'rect',
      rotation: 0,
      stroke: '#000000',
      strokeWidth: 0,
      cornerRadius: 0,
      opacity: 1,
      ...spec,
    }),
  };
}

function document(
  size: DesignSize,
  background: string,
  elements: DesignElement[],
): DesignDocument {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    width: size.width,
    height: size.height,
    background,
    elements,
  };
}

const [POSTER, SQUARE, STORY, LANDSCAPE] = DESIGN_SIZES as [
  DesignSize,
  DesignSize,
  DesignSize,
  DesignSize,
];

export const TEMPLATES: readonly Template[] = [
  {
    id: 'birthday-balloons',
    name: 'Balloon birthday',
    category: 'Birthday',
    build: (newId = defaultIdFactory) => {
      const b = makeBuilder(POSTER.width, newId);
      return document(POSTER, '#FFF4E6', [
        b.rect({
          x: 60,
          y: 60,
          width: 1120,
          height: 1634,
          fill: '#FFFFFF',
          cornerRadius: 40,
        }),
        b.sticker('balloon-red', 110, 120, 300, -12),
        b.sticker('balloon-blue', 830, 140, 300, 10),
        b.sticker('confetti', 470, 90, 300),
        b.text({
          text: "You're invited!",
          y: 520,
          fontSize: 64,
          fontStyle: 'italic',
          fontFamily: 'Georgia',
          fill: '#E63946',
        }),
        b.text({
          text: "Sam's 30th\nBirthday",
          y: 640,
          fontSize: 150,
          fill: '#1D3557',
        }),
        b.sticker('birthday-cake', 470, 1020, 300),
        b.text({
          text: 'Saturday 14 June · 7:00 PM',
          y: 1380,
          fontSize: 56,
          fontStyle: 'normal',
          fill: '#1D3557',
        }),
        b.text({
          text: '12 Harbour Street, Sydney\nRSVP to Alex by 1 June',
          y: 1480,
          fontSize: 40,
          fontStyle: 'normal',
          fill: '#457B9D',
        }),
      ]);
    },
  },
  {
    id: 'birthday-confetti-square',
    name: 'Confetti party post',
    category: 'Birthday',
    build: (newId = defaultIdFactory) => {
      const b = makeBuilder(SQUARE.width, newId);
      return document(SQUARE, '#2B2D42', [
        b.sticker('confetti', 40, 40, 320),
        b.sticker('confetti', 720, 720, 320, 180),
        b.sticker('party-hat', 440, 140, 200, 8),
        b.text({
          text: "LET'S\nCELEBRATE",
          y: 380,
          fontSize: 130,
          fontFamily: 'Impact',
          fontStyle: 'normal',
          fill: '#FEE440',
        }),
        b.text({
          text: 'Jordan turns 8!',
          y: 720,
          fontSize: 64,
          fill: '#F15BB5',
        }),
        b.text({
          text: 'Sunday 3pm · The Park Pavilion',
          y: 820,
          fontSize: 40,
          fontStyle: 'normal',
          fill: '#EDF2F4',
        }),
      ]);
    },
  },
  {
    id: 'christmas-party',
    name: 'Christmas party',
    category: 'Christmas',
    build: (newId = defaultIdFactory) => {
      const b = makeBuilder(POSTER.width, newId);
      return document(POSTER, '#14532D', [
        b.rect({
          x: 50,
          y: 50,
          width: 1140,
          height: 1654,
          fill: '#FFFFFF',
          opacity: 0.08,
          cornerRadius: 30,
        }),
        b.sticker('snowflake', 90, 90, 160, 15),
        b.sticker('snowflake', 990, 120, 160, -10),
        b.sticker('bauble', 170, 820, 170, -8),
        b.sticker('bauble', 900, 840, 170, 8),
        b.text({
          text: 'Christmas\nParty',
          y: 300,
          fontSize: 170,
          fontFamily: 'Georgia',
          fill: '#FFD60A',
        }),
        b.sticker('christmas-tree', 420, 720, 400),
        b.text({
          text: 'Friday 19 December · 6:30 PM',
          y: 1200,
          fontSize: 60,
          fontStyle: 'normal',
          fill: '#FFFFFF',
        }),
        b.text({
          text: 'Food, drinks, secret Santa and carols\nThe Office Rooftop',
          y: 1300,
          fontSize: 42,
          fontStyle: 'normal',
          fill: '#D8F3DC',
        }),
        b.sticker('candy-cane', 140, 1450, 180, -15),
        b.sticker('gift-box', 920, 1450, 180, 10),
      ]);
    },
  },
  {
    id: 'christmas-story',
    name: 'Merry Christmas story',
    category: 'Christmas',
    build: (newId = defaultIdFactory) => {
      const b = makeBuilder(STORY.width, newId);
      return document(STORY, '#9D0208', [
        b.sticker('snowflake', 80, 100, 200),
        b.sticker('snowflake', 800, 260, 200, 20),
        b.text({
          text: 'Merry\nChristmas',
          y: 520,
          fontSize: 180,
          fontFamily: 'Brush Script MT',
          fontStyle: 'normal',
          fill: '#FFFFFF',
        }),
        b.sticker('christmas-tree', 340, 1000, 400),
        b.text({
          text: 'from all of us',
          y: 1500,
          fontSize: 56,
          fontStyle: 'italic',
          fontFamily: 'Georgia',
          fill: '#FFD60A',
        }),
      ]);
    },
  },
  {
    id: 'party-night',
    name: 'Party night banner',
    category: 'Party',
    build: (newId = defaultIdFactory) => {
      const b = makeBuilder(LANDSCAPE.width, newId);
      return document(LANDSCAPE, '#1B1B3A', [
        b.sticker('confetti', 60, 60, 360),
        b.sticker('confetti', 1500, 640, 360, 90),
        b.sticker('gold-star', 1560, 120, 200, 12),
        b.text({
          text: 'PARTY NIGHT',
          y: 340,
          fontSize: 200,
          fontFamily: 'Impact',
          fontStyle: 'normal',
          fill: '#F15BB5',
          letterSpacing: 8,
        }),
        b.text({
          text: 'Music · Games · Good company',
          y: 600,
          fontSize: 64,
          fontStyle: 'normal',
          fill: '#00F5D4',
        }),
        b.text({
          text: 'Saturday 9 PM — late',
          y: 720,
          fontSize: 48,
          fontStyle: 'normal',
          fill: '#FFFFFF',
        }),
      ]);
    },
  },
  ...DESIGN_SIZES.map((size): Template => ({
    id: `blank-${size.id}`,
    name: `Blank ${size.name}`,
    category: 'Blank',
    build: () => document(size, '#FFFFFF', []),
  })),
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
