import type Konva from 'konva';

/**
 * Holds the editor's Konva stage so non-React code (export) can render
 * it. Only one editor is ever mounted.
 */
let activeStage: Konva.Stage | null = null;

export function setActiveStage(stage: Konva.Stage | null): void {
  activeStage = stage;
}

export function getActiveStage(): Konva.Stage | null {
  return activeStage;
}
