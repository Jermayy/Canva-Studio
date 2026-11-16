import { useImperativeHandle, type ReactNode, type Ref } from 'react';

/**
 * DOM stand-in for react-konva (jsdom has no canvas). Each node renders a
 * div and records its latest props so tests can fire Konva events.
 */

type Props = Record<string, unknown> & {
  children?: ReactNode;
  ref?: Ref<unknown>;
};

const latestProps = new Map<string, Props>();

export function konvaProps(type: string, id?: string): Props {
  const props = latestProps.get(`${type}:${id ?? ''}`);
  if (!props) {
    throw new Error(`No ${type} rendered with id "${id ?? ''}"`);
  }
  return props;
}

export function resetKonvaMock(): void {
  latestProps.clear();
  stageNodes.clear();
}

/** Fake Konva node with the accessors the app reads. */
export function fakeNode(values: Record<string, number> = {}) {
  const state = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...values };
  const accessor = (key: keyof typeof state) => (next?: number) => {
    if (next !== undefined) {
      state[key] = next;
    }
    return state[key];
  };
  return {
    x: accessor('x'),
    y: accessor('y'),
    rotation: accessor('rotation'),
    scaleX: accessor('scaleX'),
    scaleY: accessor('scaleY'),
    name: () => '',
    visible: () => true,
    hide: () => undefined,
    show: () => undefined,
    getStage: () => null as unknown,
  };
}

const stageNodes = new Map<string, ReturnType<typeof fakeNode>>();

export const fakeStage = {
  findOne: (selector: string) => stageNodes.get(selector.replace(/^#/, '')),
  find: () => [],
  toDataURL: () =>
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  getStage(): unknown {
    return this;
  },
  name: () => '',
};

export const fakeTransformer = {
  nodes: (nodes: unknown[]) => nodes.length,
};

function makeNode(type: string) {
  function MockKonvaNode(props: Props) {
    const { children, ref } = props;
    const id = typeof props.id === 'string' ? props.id : '';
    latestProps.set(`${type}:${id}`, props);
    if (id) {
      stageNodes.set(id, fakeNode());
    }
    useImperativeHandle(ref, () => {
      if (type === 'Stage') {
        return fakeStage;
      }
      if (type === 'Transformer') {
        return fakeTransformer;
      }
      return fakeNode();
    });
    return (
      <div data-testid={`konva-${type}`} data-id={id || undefined}>
        {typeof props.text === 'string' ? props.text : null}
        {children}
      </div>
    );
  }
  MockKonvaNode.displayName = `Mock${type}`;
  return MockKonvaNode;
}

export const reactKonvaMock = {
  Stage: makeNode('Stage'),
  Layer: makeNode('Layer'),
  Group: makeNode('Group'),
  Rect: makeNode('Rect'),
  Ellipse: makeNode('Ellipse'),
  RegularPolygon: makeNode('RegularPolygon'),
  Star: makeNode('Star'),
  Text: makeNode('Text'),
  Image: makeNode('Image'),
  Transformer: makeNode('Transformer'),
};
