import type { CameraConfig } from '../camera/CameraConfig';
import type { SceneFit } from '../content/types';

/** Extra cover margin, so a camera shake does not reveal the image edge. */
const SHAKE_MARGIN = 48;

export interface SceneTransform {
  scale: number;
  x: number;
  y: number;
}

/**
 * Where to draw a scene of sceneWidth x sceneHeight image pixels in the view.
 * Both modes keep the aspect ratio and leave room for camera movement.
 */
export function fitScene(
  fit: SceneFit,
  viewWidth: number,
  viewHeight: number,
  sceneWidth: number,
  sceneHeight: number,
  camera: CameraConfig,
): SceneTransform {
  if (fit === 'width') {
    const scale = sceneWidth > 0 ? viewWidth / sceneWidth : 1;
    return {
      scale,
      x: 0,
      y: (viewHeight - sceneHeight * scale) / 2,
    };
  }

  const scale = fit === 'cover'
    ? Math.max(
      (viewWidth + (camera.maxOffsetX + SHAKE_MARGIN) * 2) / sceneWidth,
      (viewHeight + (camera.maxOffsetY + SHAKE_MARGIN) * 2) / sceneHeight,
    )
    : Math.max(
      0.01,
      Math.min(
        (viewWidth - (camera.maxOffsetX + camera.headbobX) * 2) / sceneWidth,
        (viewHeight - (camera.maxOffsetY + camera.headbobY) * 2) / sceneHeight,
      ),
    );

  return {
    scale,
    x: (viewWidth - sceneWidth * scale) / 2,
    y: (viewHeight - sceneHeight * scale) / 2,
  };
}
